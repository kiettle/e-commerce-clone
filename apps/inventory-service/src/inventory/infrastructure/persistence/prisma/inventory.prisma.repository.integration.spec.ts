import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../../../../../../prisma/generated/inventory';
import { HandleProductCreatedCommand } from '../../../application/dto/handle-product-created.command';
import { calculateProductCreatedPayloadHash } from '../../../application/services/product-created-payload-hash';
import { ConflictingProductEventError } from '../../../domain/errors/conflicting-product-event.error';
import { FlashSaleReservationError } from '../../../domain/errors/flash-sale-reservation.error';
import { InsufficientStockError } from '../../../domain/errors/insufficient-stock.error';
import { InvalidStockOperationError } from '../../../domain/errors/invalid-stock-operation.error';
import { ProductCreatedStockEvent } from '../../../domain/repositories/inventory.repository.port';
import { PrismaInventoryRepository } from './inventory.prisma.repository';
import { PrismaService } from './prisma.service';

const integrationDatabaseUrl = process.env.INVENTORY_INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;

describeWithDatabase('PrismaInventoryRepository integration', () => {
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

  it('caps 100 concurrent users at the 20-unit sale allocation and commits every winner', async () => {
    await seedSale(prisma, { normalQuantity: 1_000, saleLimit: 20 });
    const operations = Array.from({ length: 100 }, (_, index) => saleOperation(index + 1));
    const start = barrier(operations.length);

    const results = await Promise.allSettled(
      operations.map(async (operation) => {
        await start.wait();
        await repository.reserveStock(operation);
        return operation;
      }),
    );
    const successful = fulfilledValues(results);
    const rejected = rejectedReasons(results);

    expect(successful).toHaveLength(20);
    expect(rejected).toHaveLength(80);
    expect(
      rejected.every(
        (error) =>
          error instanceof FlashSaleReservationError && error.code === 'FLASH_SALE_SOLD_OUT',
      ),
    ).toBe(true);
    expect(await prisma.stockReservation.count({ where: { status: 'RESERVED' } })).toBe(20);
    await expectCounters(prisma, {
      available: 980,
      normalReserved: 20,
      saleReserved: 20,
      sold: 0,
    });

    const commitStart = barrier(successful.length);
    await Promise.all(
      successful.map(async (operation) => {
        await commitStart.wait();
        await repository.commitStock(operation);
      }),
    );

    expect(await prisma.stockReservation.count({ where: { status: 'COMMITTED' } })).toBe(20);
    expect(await prisma.stockTransaction.count({ where: { type: 'COMMIT' } })).toBe(20);
    await expectCounters(prisma, {
      available: 980,
      normalReserved: 0,
      saleReserved: 0,
      sold: 20,
    });
  });

  it('allows one claim when one user submits 20 carts concurrently', async () => {
    await seedSale(prisma, { normalQuantity: 100, saleLimit: 20 });
    const operations = Array.from({ length: 20 }, (_, index) =>
      saleOperation(index + 1, { userId: 77n }),
    );
    const start = barrier(operations.length);

    const results = await Promise.allSettled(
      operations.map(async (operation) => {
        await start.wait();
        await repository.reserveStock(operation);
      }),
    );
    const rejected = rejectedReasons(results);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(19);
    expect(
      rejected.every(
        (error) =>
          error instanceof FlashSaleReservationError && error.code === 'FLASH_SALE_LIMIT_REACHED',
      ),
    ).toBe(true);
    expect(await prisma.stockReservation.count()).toBe(1);
    await expectCounters(prisma, { available: 99, normalReserved: 1, saleReserved: 1, sold: 0 });
  });

  it('caps 100 concurrent users at the five-unit base inventory', async () => {
    await seedSale(prisma, { normalQuantity: 5, saleLimit: 20 });
    const operations = Array.from({ length: 100 }, (_, index) => saleOperation(index + 1));
    const start = barrier(operations.length);

    const results = await Promise.allSettled(
      operations.map(async (operation) => {
        await start.wait();
        await repository.reserveStock(operation);
      }),
    );
    const rejected = rejectedReasons(results);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    expect(rejected).toHaveLength(95);
    expect(rejected.every((error) => error instanceof InsufficientStockError)).toBe(true);
    expect(await prisma.stockReservation.count()).toBe(5);
    await expectCounters(prisma, { available: 0, normalReserved: 5, saleReserved: 5, sold: 0 });
  });

  it('rolls back an available sale item and regular item when another sale item is sold out', async () => {
    await seedSale(prisma, { normalQuantity: 5, saleLimit: 5 });
    await prisma.inventoryStock.createMany({
      data: [
        {
          productId: 100n,
          productSkuId: 1002n,
          skuCode: 'KB-WHITE',
          status: 'ACTIVE',
          availableQuantity: 5,
        },
        {
          productId: 100n,
          productSkuId: 1003n,
          skuCode: 'MOUSE-BLACK',
          status: 'ACTIVE',
          availableQuantity: 5,
        },
      ],
    });
    await prisma.flashSaleStock.create({
      data: {
        flashSaleId: 50n,
        flashSaleItemId: 502n,
        productSkuId: 1002n,
        originalPrice: '100.00',
        salePrice: '75.00',
        stockLimit: 1,
        soldQuantity: 1,
        maxQuantityPerUser: 1,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 600_000),
      },
    });

    await expect(
      repository.reserveStock({
        ...saleOperation(1),
        items: [
          saleItem(),
          {
            productSkuId: 1002n,
            quantity: 1,
            flashSaleId: 50n,
            flashSaleItemId: 502n,
          },
          { productSkuId: 1003n, quantity: 1, flashSaleId: null, flashSaleItemId: null },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FLASH_SALE_SOLD_OUT' });

    expect(await prisma.stockReservation.count()).toBe(0);
    expect(await prisma.stockTransaction.count({ where: { type: 'RESERVE' } })).toBe(0);
    expect(
      await prisma.inventoryStock.findMany({
        orderBy: { productSkuId: 'asc' },
        select: { productSkuId: true, availableQuantity: true, reservedQuantity: true },
      }),
    ).toEqual([
      { productSkuId: 1001n, availableQuantity: 5, reservedQuantity: 0 },
      { productSkuId: 1002n, availableQuantity: 5, reservedQuantity: 0 },
      { productSkuId: 1003n, availableQuantity: 5, reservedQuantity: 0 },
    ]);
    await expectCounters(prisma, { available: 5, normalReserved: 0, saleReserved: 0, sold: 0 });
    expect(
      await prisma.flashSaleStock.findUniqueOrThrow({ where: { flashSaleItemId: 502n } }),
    ).toMatchObject({ reservedQuantity: 0, soldQuantity: 1, stockLimit: 1 });
  });

  it('reserves and commits regular and sale items in one operation', async () => {
    await seedSale(prisma, { normalQuantity: 5, saleLimit: 5 });
    await prisma.inventoryStock.create({
      data: {
        productId: 100n,
        productSkuId: 1002n,
        skuCode: 'MOUSE-BLACK',
        status: 'ACTIVE',
        availableQuantity: 3,
      },
    });
    const operation = {
      ...saleOperation(1),
      items: [
        saleItem(),
        {
          productSkuId: 1002n,
          quantity: 2,
          flashSaleId: null,
          flashSaleItemId: null,
        },
      ],
    };

    await repository.reserveStock(operation);
    expect(await prisma.stockReservation.count()).toBe(2);
    expect(
      await prisma.inventoryStock.findUniqueOrThrow({ where: { productSkuId: 1002n } }),
    ).toMatchObject({ availableQuantity: 1, reservedQuantity: 2 });
    await expectCounters(prisma, {
      available: 4,
      normalReserved: 1,
      saleReserved: 1,
      sold: 0,
    });

    await repository.commitStock(operation);
    expect(
      await prisma.inventoryStock.findUniqueOrThrow({ where: { productSkuId: 1002n } }),
    ).toMatchObject({ availableQuantity: 1, reservedQuantity: 0 });
    await expectCounters(prisma, {
      available: 4,
      normalReserved: 0,
      saleReserved: 0,
      sold: 1,
    });
  });

  it('keeps reserve, commit, and release idempotent across both terminal paths', async () => {
    await seedSale(prisma, { normalQuantity: 10, saleLimit: 10 });
    const committedOperation = saleOperation(1);

    await repository.reserveStock(committedOperation);
    await repository.reserveStock(committedOperation);
    await expectCounters(prisma, {
      available: 9,
      normalReserved: 1,
      saleReserved: 1,
      sold: 0,
    });

    await repository.commitStock(committedOperation);
    await repository.commitStock(committedOperation);
    await expect(repository.releaseStock(committedOperation)).rejects.toBeInstanceOf(
      InvalidStockOperationError,
    );
    await expectCounters(prisma, {
      available: 9,
      normalReserved: 0,
      saleReserved: 0,
      sold: 1,
    });

    const releasedOperation = saleOperation(2);
    await repository.reserveStock(releasedOperation);
    await repository.reserveStock(releasedOperation);
    await repository.releaseStock(releasedOperation);
    await repository.releaseStock(releasedOperation);
    await expect(repository.commitStock(releasedOperation)).rejects.toBeInstanceOf(
      InvalidStockOperationError,
    );

    await expectCounters(prisma, {
      available: 9,
      normalReserved: 0,
      saleReserved: 0,
      sold: 1,
    });
    expect(
      await prisma.stockReservation.findMany({
        orderBy: { cartId: 'asc' },
        select: { cartId: true, status: true },
      }),
    ).toEqual([
      { cartId: 1n, status: 'COMMITTED' },
      { cartId: 2n, status: 'RELEASED' },
    ]);
    expect(await prisma.stockTransaction.count({ where: { type: 'RESERVE' } })).toBe(2);
    expect(await prisma.stockTransaction.count({ where: { type: 'COMMIT' } })).toBe(1);
    expect(await prisma.stockTransaction.count({ where: { type: 'RELEASE' } })).toBe(1);
  });

  it('uses inclusive start and exclusive end boundaries from one controlled database time', async () => {
    const startsAt = new Date('2026-10-01T10:00:00.000Z');
    const endsAt = new Date('2026-10-01T11:00:00.000Z');
    await seedSale(prisma, { normalQuantity: 5, saleLimit: 5, startsAt, endsAt });
    let databaseNow = new Date(startsAt.getTime() - 1);
    const repositoryWithClock = new PrismaInventoryRepository(
      prisma as unknown as PrismaService,
      async () => databaseNow,
    );

    await expect(repositoryWithClock.reserveStock(saleOperation(1))).rejects.toMatchObject({
      code: 'FLASH_SALE_NOT_ACTIVE',
    });

    databaseNow = startsAt;
    await expect(repositoryWithClock.reserveStock(saleOperation(2))).resolves.toBeUndefined();
    await repositoryWithClock.releaseStock(saleOperation(2));

    databaseNow = new Date(endsAt.getTime() - 1);
    await expect(repositoryWithClock.reserveStock(saleOperation(3))).resolves.toBeUndefined();
    await repositoryWithClock.releaseStock(saleOperation(3));

    databaseNow = endsAt;
    await expect(repositoryWithClock.reserveStock(saleOperation(4))).rejects.toMatchObject({
      code: 'FLASH_SALE_ENDED',
    });

    expect(await prisma.stockReservation.count({ where: { status: 'RESERVED' } })).toBe(0);
    expect(await prisma.stockReservation.count({ where: { status: 'RELEASED' } })).toBe(2);
    await expectCounters(prisma, { available: 5, normalReserved: 0, saleReserved: 0, sold: 0 });
  });

  it('reports sale inventory that is not initialized', async () => {
    await prisma.inventoryStock.create({
      data: {
        productId: 100n,
        productSkuId: 1001n,
        skuCode: 'KB-BLACK',
        status: 'ACTIVE',
        availableQuantity: 5,
      },
    });

    await expect(repository.reserveStock(saleOperation(1))).rejects.toMatchObject({
      code: 'FLASH_SALE_NOT_READY',
    });
  });

  it('reports exhausted sale allocation', async () => {
    await seedSale(prisma, { normalQuantity: 5, saleLimit: 1 });
    await repository.reserveStock(saleOperation(1));

    await expect(repository.reserveStock(saleOperation(2))).rejects.toMatchObject({
      code: 'FLASH_SALE_SOLD_OUT',
    });
  });

  it('reports a user who already holds an active sale claim', async () => {
    await seedSale(prisma, { normalQuantity: 5, saleLimit: 5 });
    await repository.reserveStock(saleOperation(1, { userId: 77n }));

    await expect(repository.reserveStock(saleOperation(2, { userId: 77n }))).rejects.toMatchObject({
      code: 'FLASH_SALE_LIMIT_REACHED',
    });
  });

  it('rejects per-request user-limit violations and conflicting replays', async () => {
    await seedSale(prisma, { normalQuantity: 5, saleLimit: 5 });

    await expect(
      repository.reserveStock({ ...saleOperation(1), items: [{ ...saleItem(), quantity: 2 }] }),
    ).rejects.toBeInstanceOf(FlashSaleReservationError);

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
      stockLimit: options.saleLimit,
      maxQuantityPerUser: 1,
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
  expect(sale.reservedQuantity + sale.soldQuantity).toBeLessThanOrEqual(sale.stockLimit);
}

function fulfilledValues<T>(results: PromiseSettledResult<T>[]): T[] {
  return results
    .filter((result): result is PromiseFulfilledResult<T> => result.status === 'fulfilled')
    .map(({ value }) => value);
}

function rejectedReasons<T>(results: PromiseSettledResult<T>[]): unknown[] {
  return results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(({ reason }) => reason as unknown);
}

function barrier(participants: number): { wait(): Promise<void> } {
  let arrived = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    async wait(): Promise<void> {
      arrived += 1;
      if (arrived === participants) release();
      await ready;
    },
  };
}
