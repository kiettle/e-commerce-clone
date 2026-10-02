import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../../../../../../prisma/generated/inventory';
import { calculateFlashSaleScheduledPayloadHash } from '../../../application/services/flash-sale-scheduled-payload-hash';
import { HandleFlashSaleScheduledCommand } from '../../../application/dto/handle-flash-sale-scheduled.command';
import { ConflictingFlashSaleEventError } from '../../../domain/errors/conflicting-flash-sale-event.error';
import { FlashSaleScheduledStockEvent } from '../../../domain/repositories/flash-sale-stock.repository.port';
import { PrismaFlashSaleStockRepository } from './flash-sale-stock.prisma.repository';
import { PrismaService } from './prisma.service';

const databaseUrl = process.env.INVENTORY_INTEGRATION_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('PrismaFlashSaleStockRepository', () => {
  let prisma: PrismaClient;
  let repository: PrismaFlashSaleStockRepository;

  beforeAll(() => {
    if (!databaseUrl) {
      throw new Error('INVENTORY_INTEGRATION_DATABASE_URL is required.');
    }
    if (!new URL(databaseUrl).pathname.slice(1).endsWith('_test')) {
      throw new Error('Inventory integration tests require a *_test database.');
    }
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    repository = new PrismaFlashSaleStockRepository(prisma as unknown as PrismaService);
  });

  beforeEach(async () => {
    await prisma.flashSaleStock.deleteMany();
    await prisma.processedFlashSaleEvent.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('creates one complete projection for concurrent identical deliveries', async () => {
    const event = flashSaleEvent();

    await Promise.all([
      repository.initializeFromFlashSaleScheduled(event),
      repository.initializeFromFlashSaleScheduled(event),
    ]);

    expect(await prisma.processedFlashSaleEvent.count()).toBe(1);
    expect(await prisma.flashSaleStock.count()).toBe(event.items.length);
  });

  it('accepts an identical repeat and rejects a conflicting payload', async () => {
    const event = flashSaleEvent();
    await repository.initializeFromFlashSaleScheduled(event);

    await expect(repository.initializeFromFlashSaleScheduled(event)).resolves.toBeUndefined();

    const conflicting = flashSaleEvent({
      items: [{ ...event.items[0], stockLimit: 9 }, event.items[1]],
    });
    await expect(repository.initializeFromFlashSaleScheduled(conflicting)).rejects.toBeInstanceOf(
      ConflictingFlashSaleEventError,
    );
    expect(await prisma.flashSaleStock.count()).toBe(event.items.length);
  });

  it('rolls back the processed marker when any projection row fails', async () => {
    const event = flashSaleEvent();
    await prisma.flashSaleStock.create({
      data: {
        flashSaleId: 999n,
        flashSaleItemId: event.items[1].flashSaleItemId,
        productSkuId: 999n,
        originalPrice: '20.00',
        salePrice: '10.00',
        stockLimit: 1,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      },
    });

    await expect(repository.initializeFromFlashSaleScheduled(event)).rejects.toBeDefined();
    expect(
      await prisma.processedFlashSaleEvent.findUnique({ where: { eventId: event.eventId } }),
    ).toBeNull();
    expect(await prisma.flashSaleStock.count({ where: { flashSaleId: event.flashSaleId } })).toBe(
      0,
    );

    await prisma.flashSaleStock.deleteMany();
    await expect(repository.initializeFromFlashSaleScheduled(event)).resolves.toBeUndefined();
  });
});

function flashSaleEvent(
  overrides: Partial<HandleFlashSaleScheduledCommand> = {},
): FlashSaleScheduledStockEvent {
  const command: HandleFlashSaleScheduledCommand = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    schemaVersion: 1,
    flashSaleId: 50n,
    startsAt: new Date('2026-10-01T08:00:00.000Z'),
    endsAt: new Date('2026-10-01T10:00:00.000Z'),
    items: [
      {
        flashSaleItemId: 501n,
        productSkuId: 1001n,
        stockLimit: 25,
        maxQuantityPerUser: 1,
      },
      {
        flashSaleItemId: 502n,
        productSkuId: 1002n,
        stockLimit: 10,
        maxQuantityPerUser: 1,
      },
    ],
    ...overrides,
  };
  return { ...command, payloadHash: calculateFlashSaleScheduledPayloadHash(command) };
}
