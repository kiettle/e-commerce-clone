import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../../../../../../prisma/generated/product';

const integrationDatabaseUrl = process.env.PRODUCT_INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;

describeWithDatabase('flash-sale database constraints', () => {
  let prisma: PrismaClient;
  let productSkuId: bigint;

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
  });

  beforeEach(async () => {
    await prisma.flashSale.deleteMany();
    await prisma.productOutboxEvent.deleteMany();
    await prisma.productSku.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();

    const product = await prisma.product.create({
      data: {
        name: 'Keyboard',
        sellerId: 1n,
        category: {
          create: { name: 'Accessories', slug: 'flash-sale-accessories' },
        },
        skus: {
          create: { skuCode: 'KEYBOARD-BLACK', price: 100 },
        },
      },
      include: { skus: true },
    });
    productSkuId = product.skus[0].id;
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.flashSale.deleteMany();
    await prisma.productOutboxEvent.deleteMany();
    await prisma.productSku.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.$disconnect();
  });

  it('stores a valid flash sale and its item', async () => {
    const flashSale = await createFlashSale();

    expect(flashSale.status).toBe('DRAFT');
    expect(flashSale.items).toHaveLength(1);
  });

  it('rejects an invalid time window', async () => {
    await expect(
      createFlashSale({
        startsAt: new Date('2026-09-21T12:00:00.000Z'),
        endsAt: new Date('2026-09-21T12:00:00.000Z'),
      }),
    ).rejects.toBeDefined();
  });

  it.each([
    { quantity: 0, originalPrice: 100, salePrice: 80 },
    { quantity: 1, originalPrice: 0, salePrice: 1 },
    { quantity: 1, originalPrice: 100, salePrice: 0 },
    { quantity: 1, originalPrice: 100, salePrice: 100 },
    { quantity: 1, originalPrice: 100, salePrice: 101 },
  ])('rejects invalid quantity or price values: %o', async (item) => {
    await expect(createFlashSale({}, item)).rejects.toBeDefined();
  });

  it('rejects a duplicate SKU within one flash sale', async () => {
    await expect(
      prisma.flashSale.create({
        data: {
          name: 'Duplicate item sale',
          startsAt: new Date('2026-09-21T10:00:00.000Z'),
          endsAt: new Date('2026-09-21T12:00:00.000Z'),
          items: {
            create: [validItem(), validItem()],
          },
        },
      }),
    ).rejects.toBeDefined();
  });

  function createFlashSale(
    saleOverrides: {
      startsAt?: Date;
      endsAt?: Date;
    } = {},
    itemOverrides: {
      quantity?: number;
      originalPrice?: number;
      salePrice?: number;
    } = {},
  ) {
    return prisma.flashSale.create({
      data: {
        name: 'Weekend sale',
        startsAt: new Date('2026-09-21T10:00:00.000Z'),
        endsAt: new Date('2026-09-21T12:00:00.000Z'),
        ...saleOverrides,
        items: {
          create: validItem(itemOverrides),
        },
      },
      include: { items: true },
    });
  }

  function validItem(
    overrides: {
      quantity?: number;
      originalPrice?: number;
      salePrice?: number;
    } = {},
  ) {
    return {
      productSkuId,
      originalPrice: 100,
      salePrice: 80,
      quantity: 10,
      ...overrides,
    };
  }
});
