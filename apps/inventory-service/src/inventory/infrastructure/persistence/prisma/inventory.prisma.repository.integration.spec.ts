import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../../../../../../prisma/generated/inventory';
import { HandleProductCreatedCommand } from '../../../application/dto/handle-product-created.command';
import { calculateProductCreatedPayloadHash } from '../../../application/services/product-created-payload-hash';
import { ConflictingProductEventError } from '../../../domain/errors/conflicting-product-event.error';
import { InvalidStockOperationError } from '../../../domain/errors/invalid-stock-operation.error';
import { ProductCreatedStockEvent } from '../../../domain/repositories/inventory.repository.port';
import { PrismaInventoryRepository } from './inventory.prisma.repository';
import { PrismaService } from './prisma.service';

const integrationDatabaseUrl = process.env.INVENTORY_INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;

describeWithDatabase('PrismaInventoryRepository product event idempotency', () => {
  let prisma: PrismaClient;
  let repository: PrismaInventoryRepository;

  beforeAll(() => {
    if (!integrationDatabaseUrl) {
      throw new Error('INVENTORY_INTEGRATION_DATABASE_URL is required.');
    }

    const databaseName = new URL(integrationDatabaseUrl).pathname.slice(1);
    if (!databaseName.endsWith('_test')) {
      throw new Error('Inventory integration tests require a *_test database.');
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: integrationDatabaseUrl }),
    });
    repository = new PrismaInventoryRepository(prisma as unknown as PrismaService);
  });

  beforeEach(async () => {
    await prisma.stockTransaction.deleteMany();
    await prisma.stockReservation.deleteMany();
    await prisma.flashSaleStock.deleteMany();
    await prisma.processedFlashSaleEvent.deleteMany();
    await prisma.inventoryStock.deleteMany();
    await prisma.processedProductEvent.deleteMany();
  });

  afterAll(async () => {
    await prisma?.stockTransaction.deleteMany();
    await prisma?.stockReservation.deleteMany();
    await prisma?.flashSaleStock.deleteMany();
    await prisma?.processedFlashSaleEvent.deleteMany();
    await prisma?.inventoryStock.deleteMany();
    await prisma?.processedProductEvent.deleteMany();
    await prisma?.$disconnect();
  });

  it('initializes inventory once when the same event is processed concurrently', async () => {
    const event = productEvent();

    await Promise.all([
      repository.initializeFromProductCreated(event),
      repository.initializeFromProductCreated(event),
    ]);

    expect(await prisma.processedProductEvent.count()).toBe(1);
    expect(
      await prisma.processedProductEvent.findUniqueOrThrow({
        where: { eventId: event.eventId },
      }),
    ).toMatchObject({
      schemaVersion: event.schemaVersion,
      payloadHash: event.payloadHash,
    });
    expect(await prisma.inventoryStock.count()).toBe(event.skus.length);
    expect(
      await prisma.stockTransaction.count({
        where: { type: 'INITIALIZE' },
      }),
    ).toBe(event.skus.length);
  });

  it('treats the same event ID and payload as a successful duplicate', async () => {
    const event = productEvent();

    await repository.initializeFromProductCreated(event);
    await expect(repository.initializeFromProductCreated(event)).resolves.toBeUndefined();

    expect(await prisma.processedProductEvent.count()).toBe(1);
    expect(await prisma.inventoryStock.count()).toBe(event.skus.length);
  });

  it('rejects the same event ID with a different payload', async () => {
    const event = productEvent();
    const conflicting = productEvent({ name: 'Different product name' });
    await repository.initializeFromProductCreated(event);

    await expect(repository.initializeFromProductCreated(conflicting)).rejects.toBeInstanceOf(
      ConflictingProductEventError,
    );

    expect(await prisma.processedProductEvent.count()).toBe(1);
    expect(await prisma.inventoryStock.count()).toBe(event.skus.length);
    expect(
      await prisma.inventoryStock.findUniqueOrThrow({ where: { productSkuId: 1001n } }),
    ).toMatchObject({
      availableQuantity: 50,
    });
  });

  it('rolls back the marker after initialization fails and allows a later retry', async () => {
    const event = productEvent();
    await prisma.inventoryStock.create({
      data: {
        productId: 999n,
        productSkuId: event.skus[0].productSkuId,
        skuCode: 'EXISTING-SKU',
        status: 'ACTIVE',
        availableQuantity: 1,
      },
    });

    await expect(repository.initializeFromProductCreated(event)).rejects.toBeDefined();
    expect(
      await prisma.processedProductEvent.findUnique({ where: { eventId: event.eventId } }),
    ).toBeNull();
    expect(await prisma.stockTransaction.count()).toBe(0);

    await prisma.inventoryStock.delete({
      where: { productSkuId: event.skus[0].productSkuId },
    });
    await expect(repository.initializeFromProductCreated(event)).resolves.toBeUndefined();

    expect(await prisma.processedProductEvent.count()).toBe(1);
    expect(await prisma.inventoryStock.count()).toBe(event.skus.length);
    expect(await prisma.stockTransaction.count()).toBe(event.skus.length);
  });

  it('limits 100 competing users to the five-unit sale allocation', async () => {
    await seedSale(prisma, { normalQuantity: 100, saleLimit: 5 });

    const results = await Promise.allSettled(
      Array.from({ length: 100 }, (_, index) => repository.reserveStock(saleOperation(index + 1))),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    expect(await prisma.stockReservation.count()).toBe(5);
    await expectCounters(prisma, { available: 95, normalReserved: 5, saleReserved: 5, sold: 0 });
  });

  it('allows one active sale claim when one user competes through multiple carts', async () => {
    await seedSale(prisma, { normalQuantity: 10, saleLimit: 5 });

    const results = await Promise.allSettled([
      repository.reserveStock(saleOperation(1, { userId: 77n })),
      repository.reserveStock(saleOperation(2, { userId: 77n })),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.stockReservation.count()).toBe(1);
    await expectCounters(prisma, { available: 9, normalReserved: 1, saleReserved: 1, sold: 0 });
  });

  it('uses the lower normal-stock limit', async () => {
    await seedSale(prisma, { normalQuantity: 2, saleLimit: 5 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) => repository.reserveStock(saleOperation(index + 1))),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    await expectCounters(prisma, { available: 0, normalReserved: 2, saleReserved: 2, sold: 0 });
  });

  it('uses the lower sale allocation limit', async () => {
    await seedSale(prisma, { normalQuantity: 10, saleLimit: 2 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) => repository.reserveStock(saleOperation(index + 1))),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    await expectCounters(prisma, { available: 8, normalReserved: 2, saleReserved: 2, sold: 0 });
  });

  it('rolls back every item when one item cannot be reserved', async () => {
    await seedSale(prisma, { normalQuantity: 5, saleLimit: 5 });

    await expect(
      repository.reserveStock({
        ...saleOperation(1),
        items: [
          saleItem(),
          { productSkuId: 9999n, quantity: 1, flashSaleId: null, flashSaleItemId: null },
        ],
      }),
    ).rejects.toBeDefined();

    expect(await prisma.stockReservation.count()).toBe(0);
    await expectCounters(prisma, { available: 5, normalReserved: 0, saleReserved: 0, sold: 0 });
  });

  it('keeps counters consistent during concurrent reserve replay and release', async () => {
    await seedSale(prisma, { normalQuantity: 5, saleLimit: 5 });
    const operation = saleOperation(1);
    await repository.reserveStock(operation);

    const [, release] = await Promise.allSettled([
      repository.reserveStock(operation),
      repository.releaseStock(operation),
    ]);

    expect(release.status).toBe('fulfilled');
    await expect(repository.releaseStock(operation)).resolves.toBeUndefined();
    await expectCounters(prisma, { available: 5, normalReserved: 0, saleReserved: 0, sold: 0 });
    expect(await prisma.stockReservation.findFirstOrThrow()).toMatchObject({ status: 'RELEASED' });
  });

  it('commits sale stock atomically and treats repeated commit as a no-op', async () => {
    await seedSale(prisma, { normalQuantity: 5, saleLimit: 5 });
    const operation = saleOperation(1);
    await repository.reserveStock(operation);

    await repository.commitStock(operation);
    await expect(repository.commitStock(operation)).resolves.toBeUndefined();

    await expectCounters(prisma, { available: 4, normalReserved: 0, saleReserved: 0, sold: 1 });
    expect(await prisma.stockReservation.findFirstOrThrow()).toMatchObject({ status: 'COMMITTED' });
    await expect(repository.releaseStock(operation)).rejects.toBeInstanceOf(
      InvalidStockOperationError,
    );
  });

  it('rejects inactive windows, user-limit violations, and conflicting replays', async () => {
    await seedSale(prisma, {
      normalQuantity: 5,
      saleLimit: 5,
      startsAt: new Date(Date.now() + 60_000),
      endsAt: new Date(Date.now() + 120_000),
    });
    await expect(repository.reserveStock(saleOperation(1))).rejects.toBeInstanceOf(
      InvalidStockOperationError,
    );

    await prisma.flashSaleStock.update({
      where: { flashSaleItemId: 501n },
      data: { startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 60_000) },
    });
    await expect(
      repository.reserveStock({ ...saleOperation(1), items: [{ ...saleItem(), quantity: 2 }] }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);

    const operation = saleOperation(1);
    await repository.reserveStock(operation);
    await expect(repository.reserveStock(operation)).resolves.toBeUndefined();
    await expect(
      repository.reserveStock({ ...operation, items: [{ ...saleItem(), quantity: 2 }] }),
    ).rejects.toBeDefined();
    await expect(
      repository.reserveStock({ ...operation, items: [{ ...saleItem(), flashSaleItemId: 502n }] }),
    ).rejects.toBeDefined();
  });
});

function productEvent(
  overrides: Partial<HandleProductCreatedCommand> = {},
): ProductCreatedStockEvent {
  const command: HandleProductCreatedCommand = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    schemaVersion: 1,
    productId: 100n,
    name: 'Wireless Keyboard',
    skus: [
      {
        productSkuId: 1001n,
        skuCode: 'KB-BLACK',
        status: 'AVAILABLE',
        quantity: 50,
      },
      {
        productSkuId: 1002n,
        skuCode: 'KB-WHITE',
        status: 'AVAILABLE',
        quantity: 25,
      },
    ],
    ...overrides,
  };

  return {
    ...command,
    payloadHash: calculateProductCreatedPayloadHash(command),
  };
}

async function seedSale(
  prisma: PrismaClient,
  options: {
    normalQuantity: number;
    saleLimit: number;
    startsAt?: Date;
    endsAt?: Date;
  },
): Promise<void> {
  await prisma.inventoryStock.create({
    data: {
      productId: 100n,
      productSkuId: 1001n,
      skuCode: 'KB-BLACK',
      status: 'ACTIVE',
      availableQuantity: options.normalQuantity,
      reservedQuantity: 0,
    },
  });
  await prisma.flashSaleStock.create({
    data: {
      flashSaleId: 50n,
      flashSaleItemId: 501n,
      productSkuId: 1001n,
      originalPrice: '100.00',
      salePrice: '75.00',
      quantityLimit: options.saleLimit,
      userLimit: 1,
      startsAt: options.startsAt ?? new Date(Date.now() - 60_000),
      endsAt: options.endsAt ?? new Date(Date.now() + 600_000),
    },
  });
}

function saleOperation(index: number, overrides: { userId?: bigint } = {}) {
  return {
    cartId: BigInt(index),
    checkoutId: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    userId: overrides.userId ?? BigInt(index),
    items: [saleItem()],
  };
}

function saleItem() {
  return {
    productSkuId: 1001n,
    quantity: 1,
    flashSaleId: 50n,
    flashSaleItemId: 501n,
  };
}

async function expectCounters(
  prisma: PrismaClient,
  expected: {
    available: number;
    normalReserved: number;
    saleReserved: number;
    sold: number;
  },
): Promise<void> {
  const stock = await prisma.inventoryStock.findUniqueOrThrow({ where: { productSkuId: 1001n } });
  const sale = await prisma.flashSaleStock.findUniqueOrThrow({
    where: { flashSaleItemId: 501n },
  });
  expect(stock.availableQuantity).toBe(expected.available);
  expect(stock.reservedQuantity).toBe(expected.normalReserved);
  expect(sale.reservedQuantity).toBe(expected.saleReserved);
  expect(sale.soldQuantity).toBe(expected.sold);
  expect(stock.availableQuantity).toBeGreaterThanOrEqual(0);
  expect(stock.reservedQuantity).toBeGreaterThanOrEqual(0);
  expect(sale.reservedQuantity).toBeGreaterThanOrEqual(0);
  expect(sale.soldQuantity).toBeGreaterThanOrEqual(0);
  expect(sale.reservedQuantity + sale.soldQuantity).toBeLessThanOrEqual(sale.quantityLimit);
}
