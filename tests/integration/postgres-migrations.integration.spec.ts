import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readIntegrationDatabaseUrls } from './support/database-urls';
import {
  cleanIntegrationDatabases,
  createIntegrationPrismaClients,
  disconnectIntegrationPrismaClients,
  IntegrationPrismaClients,
} from './support/prisma-clients';

describe('PostgreSQL migration harness', () => {
  const urls = readIntegrationDatabaseUrls();
  let clients: IntegrationPrismaClients;

  beforeAll(async () => {
    clients = await createIntegrationPrismaClients(urls);
  });

  beforeEach(async () => {
    await cleanIntegrationDatabases(clients);
  });

  afterAll(async () => {
    if (!clients) return;
    try {
      await cleanIntegrationDatabases(clients);
    } finally {
      await disconnectIntegrationPrismaClients(clients);
    }
  });

  it('uses five explicit localhost test databases migrated from empty', async () => {
    for (const databaseUrl of Object.values(urls)) {
      const parsed = new URL(databaseUrl);
      expect(parsed.hostname).toBe('127.0.0.1');
      expect(parsed.pathname).toMatch(/_test$/);
    }

    const migrationCounts = await Promise.all([
      clients.auth.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
      `,
      clients.product.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
      `,
      clients.inventory.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
      `,
      clients.cart.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
      `,
      clients.order.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
      `,
    ]);

    expect(migrationCounts.every(([result]) => result.count > 0n)).toBe(true);
  });

  it('runs every available seed script after migration', async () => {
    runNpmScript('prisma:auth:seed', { AUTH_DATABASE_URL: urls.auth });
    runNpmScript('prisma:product:seed', { PRODUCT_DATABASE_URL: urls.product });
    runNpmScript('prisma:inventory:seed', { INVENTORY_DATABASE_URL: urls.inventory });

    await expect(clients.auth.user.count()).resolves.toBe(1);
    await expect(clients.product.category.count()).resolves.toBe(4);
    await expect(clients.product.product.count()).resolves.toBe(10);
    await expect(clients.product.productSku.count()).resolves.toBe(29);
    await expect(clients.inventory.inventoryStock.count()).resolves.toBe(29);
    await expect(clients.inventory.stockTransaction.count()).resolves.toBe(29);
  });

  it('keeps old-style rows readable through nullable compatibility columns', async () => {
    const order = await clients.order.order.create({
      data: {
        userId: 10n,
        totalAmount: 19.9,
      },
    });
    const processedEvent = await clients.inventory.processedProductEvent.create({
      data: {
        eventId: `legacy-${randomUUID()}`,
        eventType: 'PRODUCT_CREATED',
      },
    });

    expect(order).toMatchObject({
      checkoutId: null,
      cartId: null,
      requestHash: null,
      requestHashVersion: null,
    });
    expect(processedEvent).toMatchObject({ schemaVersion: null, payloadHash: null });
  });

  it('creates the required partial indexes physically', async () => {
    const cartIndexes = await clients.cart.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
    `;
    const inventoryIndexes = await clients.inventory.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
    `;

    expect(cartIndexes).toContainEqual(
      expect.objectContaining({
        indexname: 'carts_user_id_active_key',
        indexdef: expect.stringContaining("WHERE (status = 'ACTIVE'"),
      }),
    );
    expect(inventoryIndexes).toContainEqual(
      expect.objectContaining({
        indexname: 'stock_reservations_active_user_sale_item_key',
        indexdef: expect.stringContaining('WHERE'),
      }),
    );
  });

  it('creates and enforces database check constraints', async () => {
    const productChecks = await constraintNames(clients.product, 'c');
    const inventoryChecks = await constraintNames(clients.inventory, 'c');
    const cartChecks = await constraintNames(clients.cart, 'c');

    expect(productChecks).toEqual(
      expect.arrayContaining([
        'flash_sales_time_window_check',
        'flash_sale_items_sale_price_check',
      ]),
    );
    expect(inventoryChecks).toEqual(
      expect.arrayContaining([
        'inventory_stocks_counters_check',
        'flash_sale_stocks_counters_check',
      ]),
    );
    expect(cartChecks).toEqual(
      expect.arrayContaining([
        'cart_items_sale_context_pair_check',
        'cart_items_price_source_context_check',
      ]),
    );

    await expect(
      clients.product.flashSale.create({
        data: {
          name: 'Invalid window',
          startsAt: new Date('2026-10-01T10:00:00.000Z'),
          endsAt: new Date('2026-10-01T09:00:00.000Z'),
        },
      }),
    ).rejects.toBeDefined();
    await expect(
      clients.inventory.inventoryStock.create({
        data: {
          productId: 1n,
          productSkuId: 1n,
          skuCode: 'INVALID-COUNTER',
          availableQuantity: -1,
        },
      }),
    ).rejects.toBeDefined();
  });

  it('rejects duplicates through physical unique indexes', async () => {
    await clients.auth.user.create({
      data: { id: 1n, email: 'unique@example.com', password: 'hash', role: 'USER' },
    });
    await expect(
      clients.auth.user.create({
        data: { id: 2n, email: 'unique@example.com', password: 'hash', role: 'USER' },
      }),
    ).rejects.toBeDefined();

    const aggregate = {
      aggregateType: 'PRODUCT',
      aggregateId: 10n,
      aggregateVersion: 1,
      eventType: 'PRODUCT_CREATED',
      schemaVersion: 1,
      partitionKey: '10',
      occurredAt: new Date('2026-09-21T08:00:00.000Z'),
      payload: { productId: '10', name: 'Keyboard', skus: [] },
    };
    await clients.product.productOutboxEvent.create({
      data: { id: randomUUID(), ...aggregate },
    });
    await expect(
      clients.product.productOutboxEvent.create({
        data: { id: randomUUID(), ...aggregate },
      }),
    ).rejects.toBeDefined();

    await clients.cart.cart.create({ data: { userId: 50n } });
    await expect(clients.cart.cart.create({ data: { userId: 50n } })).rejects.toBeDefined();
  });

  it('can rerun migrate deploy without applying new changes', () => {
    runNpmScript('prisma:auth:deploy', { AUTH_DATABASE_URL: urls.auth });
    runNpmScript('prisma:product:deploy', { PRODUCT_DATABASE_URL: urls.product });
    runNpmScript('prisma:inventory:deploy', { INVENTORY_DATABASE_URL: urls.inventory });
    runNpmScript('prisma:cart:deploy', { CART_DATABASE_URL: urls.cart });
    runNpmScript('prisma:order:deploy', { ORDER_DATABASE_URL: urls.order });
  });
});

type RawQueryClient = {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
};

async function constraintNames(client: RawQueryClient, type: 'c' | 'u'): Promise<string[]> {
  const constraints = await client.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT conname AS name FROM pg_constraint WHERE contype = '${type}' ORDER BY conname`,
  );
  return constraints.map(({ name }) => name);
}

function runNpmScript(script: string, environment: Record<string, string>): void {
  execFileSync('npm', ['run', script], {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stdio: 'pipe',
  });
}
