import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../../../../../../prisma/generated/product';
import { PrismaService } from '../../../../catalog/infrastructure/persistence/prisma/prisma.service';
import { CreateFlashSaleUseCase } from '../../../application/use-cases/create-flash-sale.use-case';
import { UpdateFlashSaleUseCase } from '../../../application/use-cases/update-flash-sale.use-case';
import { FlashSaleNotDraftError } from '../../../domain/errors/flash-sale-not-draft.error';
import { FlashSaleOverlapError } from '../../../domain/errors/flash-sale-overlap.error';
import { FlashSalePriceChangedError } from '../../../domain/errors/flash-sale-price-changed.error';
import { FlashSaleProductInactiveError } from '../../../domain/errors/flash-sale-product-inactive.error';
import { FlashSaleScheduleTimeError } from '../../../domain/errors/flash-sale-schedule-time.error';
import { FlashSaleSkuInactiveError } from '../../../domain/errors/flash-sale-sku-inactive.error';
import { FlashSaleSkuNotFoundError } from '../../../domain/errors/flash-sale-sku-not-found.error';
import { PrismaFlashSaleRepository } from './flash-sale.prisma.repository';

const integrationDatabaseUrl = process.env.PRODUCT_INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;

describeWithDatabase('PrismaFlashSaleRepository', () => {
  let prisma: PrismaClient;
  let repository: PrismaFlashSaleRepository;
  let firstSkuId: bigint;
  let secondSkuId: bigint;

  beforeAll(() => {
    if (!integrationDatabaseUrl) {
      throw new Error('PRODUCT_INTEGRATION_DATABASE_URL is required.');
    }
    const databaseName = new URL(integrationDatabaseUrl).pathname.slice(1);
    if (!databaseName.endsWith('_test')) {
      throw new Error('Product integration tests require a *_test database.');
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: integrationDatabaseUrl }),
    });
    repository = new PrismaFlashSaleRepository(prisma as unknown as PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase();
    const product = await prisma.product.create({
      data: {
        name: 'Keyboard',
        sellerId: 1n,
        category: { create: { name: 'Accessories', slug: 'draft-sale-accessories' } },
        skus: {
          create: [
            { skuCode: 'KEYBOARD-BLACK', price: 100 },
            { skuCode: 'KEYBOARD-WHITE', price: 120 },
          ],
        },
      },
      include: { skus: { orderBy: { id: 'asc' } } },
    });
    [firstSkuId, secondSkuId] = product.skus.map((sku) => sku.id);
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await cleanDatabase();
    await prisma.$disconnect();
  });

  it('creates a complete draft with server-captured prices and no event', async () => {
    const useCase = new CreateFlashSaleUseCase(repository);

    const flashSale = await useCase.execute(createCommand());

    expect(flashSale.status).toBe('DRAFT');
    expect(flashSale.items.map((item) => item.originalPrice)).toEqual([100, 120]);
    await expect(prisma.flashSale.count()).resolves.toBe(1);
    await expect(prisma.flashSaleItem.count()).resolves.toBe(2);
    await expect(prisma.productOutboxEvent.count()).resolves.toBe(0);
  });

  it('does not persist a partial sale when a SKU is missing', async () => {
    const useCase = new CreateFlashSaleUseCase(repository);

    await expect(
      useCase.execute({
        ...createCommand(),
        items: [{ productSkuId: 999999n, salePrice: 10, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(FlashSaleSkuNotFoundError);
    await expect(prisma.flashSale.count()).resolves.toBe(0);
    await expect(prisma.flashSaleItem.count()).resolves.toBe(0);
  });

  it('replaces all items and captures the latest regular price', async () => {
    const create = new CreateFlashSaleUseCase(repository);
    const created = await create.execute(createCommand());
    await prisma.productSku.update({
      where: { id: secondSkuId },
      data: { price: 130 },
    });

    const update = new UpdateFlashSaleUseCase(repository);
    const updated = await update.execute({
      flashSaleId: created.id!,
      name: 'Replacement sale',
      description: null,
      startsAt: new Date('2026-09-26T10:00:00.000Z'),
      endsAt: new Date('2026-09-26T13:00:00.000Z'),
      items: [{ productSkuId: secondSkuId, salePrice: 90, quantity: 2 }],
    });

    expect(updated.name).toBe('Replacement sale');
    expect(updated.description).toBeNull();
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].originalPrice).toBe(130);
    expect(updated.items[0].productSkuId).toBe(secondSkuId);
    await expect(prisma.flashSaleItem.count()).resolves.toBe(1);
  });

  it('keeps a cancelled sale and its items queryable', async () => {
    const created = await new CreateFlashSaleUseCase(repository).execute(createCommand());

    const cancelled = await repository.cancelDraft(created.id!);
    const loaded = await repository.findById(created.id!);

    expect(cancelled.status).toBe('CANCELLED');
    expect(loaded?.status).toBe('CANCELLED');
    expect(loaded?.items).toHaveLength(2);
    await expect(prisma.productOutboxEvent.count()).resolves.toBe(0);
  });

  it('converges concurrent scheduling of the same sale to one event', async () => {
    const draft = await createDraft({ skuIds: [firstSkuId] });

    const results = await Promise.allSettled([
      schedule(draft.id!, '550e8400-e29b-41d4-a716-446655440101'),
      schedule(draft.id!, '550e8400-e29b-41d4-a716-446655440102'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.any(FlashSaleNotDraftError),
    });
    await expect(flashSaleEventCount()).resolves.toBe(1);
    await expect(
      prisma.flashSale.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({ status: 'SCHEDULED' });

    const event = await prisma.productOutboxEvent.findFirstOrThrow({
      where: { aggregateType: 'FLASH_SALE', aggregateId: draft.id },
    });
    const payload = event.payload as {
      items: Array<{ flashSaleItemId: string }>;
    };
    expect(payload.items.map((item) => item.flashSaleItemId)).toEqual(
      draft.items.map((item) => item.id!.toString()),
    );
  });

  it('allows only one of two overlapping sales for the same SKU to schedule', async () => {
    const first = await createDraft({ skuIds: [firstSkuId] });
    const second = await createDraft({
      skuIds: [firstSkuId],
      startsAt: new Date('2026-09-25T11:00:00.000Z'),
      endsAt: new Date('2026-09-25T13:00:00.000Z'),
    });

    const results = await Promise.allSettled([
      schedule(first.id!, '550e8400-e29b-41d4-a716-446655440103'),
      schedule(second.id!, '550e8400-e29b-41d4-a716-446655440104'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: expect.any(FlashSaleOverlapError),
    });
    await expect(flashSaleEventCount()).resolves.toBe(1);
  });

  it('allows non-overlapping sales for the same SKU to schedule', async () => {
    const first = await createDraft({ skuIds: [firstSkuId] });
    const second = await createDraft({
      skuIds: [firstSkuId],
      startsAt: new Date('2026-09-25T12:00:00.000Z'),
      endsAt: new Date('2026-09-25T14:00:00.000Z'),
    });

    const results = await Promise.allSettled([
      schedule(first.id!, '550e8400-e29b-41d4-a716-446655440105'),
      schedule(second.id!, '550e8400-e29b-41d4-a716-446655440106'),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    await expect(flashSaleEventCount()).resolves.toBe(2);
  });

  it('allows sales with disjoint SKUs to schedule concurrently', async () => {
    const first = await createDraft({ skuIds: [firstSkuId] });
    const second = await createDraft({ skuIds: [secondSkuId] });

    const results = await Promise.allSettled([
      schedule(first.id!, '550e8400-e29b-41d4-a716-446655440107'),
      schedule(second.id!, '550e8400-e29b-41d4-a716-446655440108'),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    await expect(flashSaleEventCount()).resolves.toBe(2);
  });

  it('reports a changed SKU price and preserves the draft', async () => {
    const draft = await createDraft({ skuIds: [firstSkuId] });
    await prisma.productSku.update({ where: { id: firstSkuId }, data: { price: 101 } });

    await expect(schedule(draft.id!, '550e8400-e29b-41d4-a716-446655440109')).rejects.toMatchObject(
      {
        code: 'FLASH_SALE_PRICE_CHANGED',
      } satisfies Partial<FlashSalePriceChangedError>,
    );
    await expect(
      prisma.flashSale.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({ status: 'DRAFT' });
    await expect(flashSaleEventCount()).resolves.toBe(0);
  });

  it('rejects inactive products and preserves the draft', async () => {
    const draft = await createDraft({ skuIds: [firstSkuId] });
    const sku = await prisma.productSku.findUniqueOrThrow({ where: { id: firstSkuId } });
    await prisma.product.update({ where: { id: sku.productId }, data: { status: 'INACTIVE' } });

    await expect(
      schedule(draft.id!, '550e8400-e29b-41d4-a716-446655440112'),
    ).rejects.toBeInstanceOf(FlashSaleProductInactiveError);
    await expect(
      prisma.flashSale.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({ status: 'DRAFT' });
    await expect(flashSaleEventCount()).resolves.toBe(0);
  });

  it('rejects inactive SKUs and preserves the draft', async () => {
    const draft = await createDraft({ skuIds: [firstSkuId] });
    await prisma.productSku.update({
      where: { id: firstSkuId },
      data: { status: 'DISABLED' },
    });

    await expect(
      schedule(draft.id!, '550e8400-e29b-41d4-a716-446655440113'),
    ).rejects.toBeInstanceOf(FlashSaleSkuInactiveError);
    await expect(
      prisma.flashSale.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({ status: 'DRAFT' });
    await expect(flashSaleEventCount()).resolves.toBe(0);
  });

  it('rejects a sale whose scheduling lead time has elapsed', async () => {
    const draft = await createDraft({
      skuIds: [firstSkuId],
      startsAt: new Date('2026-09-20T07:00:00.000Z'),
      endsAt: new Date('2026-09-20T09:00:00.000Z'),
    });

    await expect(
      schedule(draft.id!, '550e8400-e29b-41d4-a716-446655440114'),
    ).rejects.toBeInstanceOf(FlashSaleScheduleTimeError);
    await expect(flashSaleEventCount()).resolves.toBe(0);
  });

  it('rolls back scheduled status when the outbox insert fails', async () => {
    const draft = await createDraft({ skuIds: [firstSkuId] });
    const duplicateEventId = '550e8400-e29b-41d4-a716-446655440110';
    await prisma.productOutboxEvent.create({
      data: {
        id: duplicateEventId,
        aggregateType: 'TEST',
        aggregateId: 999n,
        aggregateVersion: 1,
        eventType: 'TEST',
        partitionKey: '999',
        payload: {},
      },
    });

    await expect(schedule(draft.id!, duplicateEventId)).rejects.toBeDefined();
    await expect(
      prisma.flashSale.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({ status: 'DRAFT' });
    await expect(flashSaleEventCount()).resolves.toBe(0);
  });

  it('creates no outbox event when the status update cannot schedule a draft', async () => {
    const draft = await createDraft({ skuIds: [firstSkuId] });
    await repository.cancelDraft(draft.id!);

    await expect(
      schedule(draft.id!, '550e8400-e29b-41d4-a716-446655440111'),
    ).rejects.toBeInstanceOf(FlashSaleNotDraftError);
    await expect(flashSaleEventCount()).resolves.toBe(0);
  });

  function createCommand() {
    return {
      name: 'Weekend sale',
      description: 'Keyboards',
      startsAt: new Date('2026-09-25T10:00:00.000Z'),
      endsAt: new Date('2026-09-25T12:00:00.000Z'),
      items: [
        { productSkuId: firstSkuId, salePrice: 80, quantity: 5 },
        { productSkuId: secondSkuId, salePrice: 90, quantity: 3 },
      ],
    };
  }

  function createDraft(options: { skuIds: bigint[]; startsAt?: Date; endsAt?: Date }) {
    const prices = new Map([
      [firstSkuId, 80],
      [secondSkuId, 90],
    ]);
    return new CreateFlashSaleUseCase(repository).execute({
      name: 'Concurrent sale',
      description: null,
      startsAt: options.startsAt ?? new Date('2026-09-25T10:00:00.000Z'),
      endsAt: options.endsAt ?? new Date('2026-09-25T12:00:00.000Z'),
      items: options.skuIds.map((productSkuId) => ({
        productSkuId,
        salePrice: prices.get(productSkuId)!,
        quantity: 5,
      })),
    });
  }

  function schedule(flashSaleId: bigint, eventId: string) {
    return repository.scheduleDraft({
      flashSaleId,
      eventId,
      occurredAt: new Date('2026-09-20T08:00:00.000Z'),
    });
  }

  function flashSaleEventCount(): Promise<number> {
    return prisma.productOutboxEvent.count({ where: { aggregateType: 'FLASH_SALE' } });
  }

  async function cleanDatabase(): Promise<void> {
    await prisma.flashSale.deleteMany();
    await prisma.productOutboxEvent.deleteMany();
    await prisma.productSku.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
  }
});
