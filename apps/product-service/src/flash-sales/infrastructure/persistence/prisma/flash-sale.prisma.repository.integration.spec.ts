import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../../../../../../prisma/generated/product';
import { PrismaService } from '../../../../catalog/infrastructure/persistence/prisma/prisma.service';
import { CreateFlashSaleUseCase } from '../../../application/use-cases/create-flash-sale.use-case';
import { UpdateFlashSaleUseCase } from '../../../application/use-cases/update-flash-sale.use-case';
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

  async function cleanDatabase(): Promise<void> {
    await prisma.flashSale.deleteMany();
    await prisma.productOutboxEvent.deleteMany();
    await prisma.productSku.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
  }
});
