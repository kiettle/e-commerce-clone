import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../../../../../../prisma/generated/inventory';
import { HandleProductCreatedCommand } from '../../../application/dto/handle-product-created.command';
import { calculateProductCreatedPayloadHash } from '../../../application/services/product-created-payload-hash';
import { ConflictingProductEventError } from '../../../domain/errors/conflicting-product-event.error';
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
    await prisma.inventoryStock.deleteMany();
    await prisma.processedProductEvent.deleteMany();
  });

  afterAll(async () => {
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
