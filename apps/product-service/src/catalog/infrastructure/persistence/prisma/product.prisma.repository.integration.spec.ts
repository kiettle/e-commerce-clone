import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../../../../../../prisma/generated/product';
import {
  ProductCreationData,
  ProductSkuCreationData,
} from '../../../application/ports/product-creation.repository.port';
import { ProductSkuStatus } from '../../../domain/enums/product-sku-status.enum';
import { ProductStatus } from '../../../domain/enums/product-status.enum';
import { PrismaProductRepository } from './product.prisma.repository';
import { PrismaService } from './prisma.service';

const integrationDatabaseUrl = process.env.PRODUCT_INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;

describeWithDatabase('PrismaProductRepository atomic product creation', () => {
  let prisma: PrismaClient;
  let repository: PrismaProductRepository;
  let categoryId: bigint;

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
    repository = new PrismaProductRepository(prisma as unknown as PrismaService);
  });

  beforeEach(async () => {
    await prisma.productOutboxEvent.deleteMany();
    await prisma.productSku.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();

    const category = await prisma.category.create({
      data: { name: 'Accessories', slug: 'accessories' },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('creates the product, SKUs, and pending outbox event together', async () => {
    const data = productData(categoryId);

    const product = await repository.createWithOutbox(data);

    expect(await prisma.product.count()).toBe(1);
    expect(await prisma.productSku.count()).toBe(2);
    expect(await prisma.productOutboxEvent.count()).toBe(1);

    const outboxEvent = await prisma.productOutboxEvent.findUniqueOrThrow({
      where: { id: data.eventId },
    });
    expect(outboxEvent).toMatchObject({
      aggregateId: product.id,
      eventType: 'PRODUCT_CREATED',
      schemaVersion: 1,
      partitionKey: product.id.toString(),
      occurredAt: data.occurredAt,
      status: 'PENDING',
      attemptCount: 0,
    });
    expect(outboxEvent.payload).toEqual({
      productId: product.id.toString(),
      name: data.name,
      skus: product.skus.map((sku, index) => ({
        productSkuId: sku.id.toString(),
        skuCode: sku.skuCode,
        status: sku.status,
        quantity: data.skus[index].quantity,
      })),
    });
    expect(() => JSON.stringify(outboxEvent.payload)).not.toThrow();
  });

  it('rolls back product and SKUs when the outbox insert fails', async () => {
    const eventId = '550e8400-e29b-41d4-a716-446655440001';
    await repository.createWithOutbox(productData(categoryId, eventId));

    await expect(
      repository.createWithOutbox({
        ...productData(categoryId, eventId),
        name: 'Second Product',
        skus: [sku('SECOND-SKU', 3)],
      }),
    ).rejects.toBeDefined();

    expect(await prisma.product.count()).toBe(1);
    expect(await prisma.productSku.count()).toBe(2);
    expect(await prisma.productOutboxEvent.count()).toBe(1);
    expect(await prisma.product.findFirst({ where: { name: 'Second Product' } })).toBeNull();
  });

  it('does not create an outbox event when SKU persistence fails', async () => {
    const duplicateSku = sku('DUPLICATE-SKU', 1);

    await expect(
      repository.createWithOutbox({
        ...productData(categoryId),
        skus: [duplicateSku, duplicateSku],
      }),
    ).rejects.toBeDefined();

    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.productSku.count()).toBe(0);
    expect(await prisma.productOutboxEvent.count()).toBe(0);
  });
});

function productData(
  categoryId: bigint,
  eventId = '550e8400-e29b-41d4-a716-446655440000',
): ProductCreationData {
  return {
    eventId,
    occurredAt: new Date('2026-09-20T08:00:00.000Z'),
    name: 'Mechanical Keyboard',
    description: 'Hot-swappable keyboard',
    imageUrl: null,
    categoryId,
    sellerId: 7n,
    status: ProductStatus.Active,
    skus: [sku('KEYBOARD-BLACK', 12), sku('KEYBOARD-WHITE', 0)],
  };
}

function sku(skuCode: string, quantity: number): ProductSkuCreationData {
  return {
    skuCode,
    price: 79.9,
    status: ProductSkuStatus.Available,
    quantity,
  };
}
