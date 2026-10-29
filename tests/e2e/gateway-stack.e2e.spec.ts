import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient } from 'redis';
import { productSearchCacheKey } from '../../apps/product-service/src/catalog/infrastructure/cache/product-search-cache.codec';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createIntegrationPrismaClients,
  disconnectIntegrationPrismaClients,
  type IntegrationPrismaClients,
} from '../integration/support/prisma-clients';

const execFileAsync = promisify(execFile);
const PASSWORD = 'password123';
const ADMIN_EMAIL = 'admin.e2e@example.test';
const CUSTOMER_ONE_EMAIL = 'customer-one.e2e@example.test';
const CUSTOMER_TWO_EMAIL = 'customer-two.e2e@example.test';
const CUSTOMER_THREE_EMAIL = 'customer-three.e2e@example.test';

interface ApiResponse<T = Record<string, unknown>> {
  status: number;
  body: T;
}

interface ProductResponse {
  id: number;
  name: string;
  skus: Array<{ id: number; price: number; skuCode: string }>;
}

interface FlashSaleResponse {
  id: number;
  items: Array<{ id: number; productSkuId: number; salePrice: number }>;
}

interface CartResponse {
  id: number;
  status: string;
  items: Array<{
    productSkuId: number;
    price: number;
    regularPrice: number;
    priceSource: 'REGULAR' | 'FLASH_SALE';
    flashSaleId: number | null;
    flashSaleItemId: number | null;
  }>;
}

interface CheckoutResponse {
  checkoutId: string;
  status: string;
  orderId: number;
  cart: CartResponse;
}

interface CheckoutPendingResponse {
  checkoutId: string;
  status: 'RECONCILIATION_REQUIRED';
}

interface ErrorResponse {
  code?: string;
  message?: string | string[];
}

describe.sequential('full gateway stack', () => {
  const gatewayUrl = requiredEnvironment('E2E_GATEWAY_URL');
  const redpandaContainer = requiredEnvironment('E2E_REDPANDA_CONTAINER');
  let databases: IntegrationPrismaClients;
  let adminToken: string;
  let customerOneToken: string;
  let customerTwoToken: string;
  let customerThreeToken: string;
  let happyProduct: ProductResponse;
  let happySale: FlashSaleResponse;
  let regularProduct: ProductResponse;
  let regularCheckoutKey: string;

  beforeAll(async () => {
    expect(process.env.GATEWAY_E2E_ACTIVE).toBe('1');
    databases = await createIntegrationPrismaClients();
    [adminToken, customerOneToken, customerTwoToken, customerThreeToken] = await Promise.all([
      login(ADMIN_EMAIL),
      login(CUSTOMER_ONE_EMAIL),
      login(CUSTOMER_TWO_EMAIL),
      login(CUSTOMER_THREE_EMAIL),
    ]);
  });

  afterAll(async () => {
    if (databases) {
      await disconnectIntegrationPrismaClients(databases);
    }
  });

  it('caches authenticated catalog searches, expires edits, and survives Redis loss and recovery', async () => {
    const redisContainer = requiredEnvironment('REDIS_TEST_CONTAINER');
    expect(redisContainer).toMatch(/^ecommerce-gateway-e2e-redis-/);
    const redis = createClient({
      url: requiredEnvironment('PRODUCT_REDIS_URL'),
      disableOfflineQueue: true,
    });
    redis.on('error', () => {});
    await redis.connect();
    try {
      const category = await createCategory('cache');
      const created = await request<ProductResponse>('/api/products', {
        method: 'POST',
        token: adminToken,
        body: productRequest(category.id, 'Cache Keyboard', [
          { skuCode: uniqueCode('CACHE'), price: 19.95, quantity: 5 },
        ]),
      });
      expect(created.status).toBe(201);
      const path = `/api/products?categoryId=${category.id}`;
      const key = productSearchCacheKey({ categoryId: BigInt(category.id) });
      const first = await request<ProductResponse[]>(path, { token: customerOneToken });
      expect(first.status).toBe(200);
      expect(first.body).toEqual([created.body]);
      await waitUntil(async () => {
        await request(path, { token: customerOneToken });
        return (await redis.exists(key)) === 1;
      }, 'product cache population');
      const remainingTtl = await redis.pTTL(key);
      expect(remainingTtl).toBeGreaterThan(0);
      expect(remainingTtl).toBeLessThanOrEqual(2000);
      expect(await request(path, { token: customerTwoToken })).toEqual(first);
      expect((await request(path)).status).toBe(401);

      const updated = await request(`/api/products/${created.body.id}`, {
        method: 'PUT',
        token: adminToken,
        body: { name: 'Renamed Cache Keyboard' },
      });
      expect(updated.status).toBe(200);
      expect(await request(path, { token: customerOneToken })).toEqual(first);
      await waitUntil(async () => (await redis.exists(key)) === 0, 'cache expiry');
      const fresh = await request<ProductResponse[]>(path, { token: customerOneToken });
      expect(fresh.body[0].name).toBe('Renamed Cache Keyboard');

      await docker('stop', redisContainer);
      try {
        const withoutRedis = await request<ProductResponse[]>(path, { token: customerOneToken });
        expect(withoutRedis).toEqual(fresh);
        expect((await fetch(requiredEnvironment('E2E_PRODUCT_HEALTH_URL'))).status).toBe(200);
      } finally {
        await docker('start', redisContainer);
      }
      await waitUntil(async () => {
        if (!redis.isReady) return false;
        await request(path, { token: customerOneToken });
        return (await redis.exists(key)) === 1;
      }, 'cache recovery');
      expect(await request(path, { token: customerOneToken })).toEqual(fresh);

      expect(
        (
          await request(`/api/products/${created.body.id}`, {
            method: 'DELETE',
            token: adminToken,
          })
        ).status,
      ).toBe(200);
      await waitUntil(async () => (await redis.exists(key)) === 0, 'deleted product cache expiry');
      const empty = await request<ProductResponse[]>(path, { token: customerOneToken });
      expect(empty).toEqual({ status: 200, body: [] });
      expect(await redis.get(key)).toBe('[]');
      expect(await request(path, { token: customerOneToken })).toEqual(empty);
    } finally {
      if (redis.isOpen) redis.destroy();
    }
  });

  it('enforces administrator access and lets an admin create and schedule a sale', async () => {
    const category = await createCategory('authorization');
    const productBody = productRequest(category.id, 'Authorization Keyboard', [
      { skuCode: uniqueCode('AUTH'), price: 89.9, quantity: 10 },
    ]);

    const forbiddenProduct = await request<ErrorResponse>('/api/products', {
      method: 'POST',
      token: customerOneToken,
      body: productBody,
    });
    expect(forbiddenProduct.status).toBe(403);

    const createdProduct = await request<ProductResponse>('/api/products', {
      method: 'POST',
      token: adminToken,
      body: productBody,
    });
    expect(createdProduct.status).toBe(201);
    happyProduct = createdProduct.body;
    await waitForProductProjection(happyProduct.id, happyProduct.skus.length);

    const saleBody = saleRequest('Authorization Sale', happyProduct.skus[0].id, 49.9, 5);
    const forbiddenSale = await request<ErrorResponse>('/api/flash-sales', {
      method: 'POST',
      token: customerOneToken,
      body: saleBody,
    });
    expect(forbiddenSale.status).toBe(403);

    const createdSale = await request<FlashSaleResponse>('/api/flash-sales', {
      method: 'POST',
      token: adminToken,
      body: saleBody,
    });
    expect(createdSale.status).toBe(201);
    happySale = createdSale.body;

    const forbiddenSchedule = await request<ErrorResponse>(
      `/api/flash-sales/${happySale.id}/schedule`,
      { method: 'POST', token: customerOneToken },
    );
    expect(forbiddenSchedule.status).toBe(403);

    const scheduled = await request<FlashSaleResponse>(
      `/api/flash-sales/${happySale.id}/schedule`,
      { method: 'POST', token: adminToken },
    );
    expect(scheduled.status).toBe(201);
    await waitForSaleProjection(happySale.id, happySale.items.length);
    await expectProductEventProcessed(happyProduct.id);
    await expectSaleEventProcessed(happySale.id);
  });

  it('recovers an order whose successful create response was lost', async () => {
    await makeSaleActive(happySale.id);

    const added = await addItem(customerOneToken, happyProduct.skus[0].id);
    expect(added.items).toHaveLength(1);
    expect(added.items[0]).toMatchObject({
      price: 49.9,
      regularPrice: 89.9,
      priceSource: 'FLASH_SALE',
      flashSaleId: happySale.id,
      flashSaleItemId: happySale.items[0].id,
    });

    const key = randomUUID();
    const first = await checkout<CheckoutPendingResponse>(customerOneToken, added.id, key);
    expect(first.status).toBe(202);
    expect(first.body.status).toBe('RECONCILIATION_REQUIRED');

    const pendingAttempt = await databases.cart.checkoutAttempt.findUniqueOrThrow({
      where: { id: first.body.checkoutId },
    });
    expect(pendingAttempt).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      reconciliationAction: 'CHECK_ORDER',
      orderId: null,
    });

    const persistedOrders = await databases.order.order.findMany({
      where: { checkoutId: first.body.checkoutId },
    });
    expect(persistedOrders).toHaveLength(1);
    const pendingReservations = await databases.inventory.stockReservation.findMany({
      where: { checkoutId: first.body.checkoutId },
    });
    expect(pendingReservations).toHaveLength(1);
    expect(pendingReservations[0].status).toBe('RESERVED');
    expect(
      await databases.inventory.stockTransaction.count({
        where: { cartId: BigInt(added.id), type: 'RELEASE' },
      }),
    ).toBe(0);

    const recovered = await checkout(customerOneToken, added.id, key);
    expect(recovered.status).toBe(200);
    expect(recovered.body.checkoutId).toBe(first.body.checkoutId);
    expect(recovered.body.orderId).toBe(Number(persistedOrders[0].id));
    await verifyCompletedCheckout(recovered.body.checkoutId);
    await verifySaleCounters(happySale.items[0].id);
  });

  it('checks out a sale item and replays the completed checkout idempotently', async () => {
    const category = await createCategory('happy-checkout');
    const product = await createProduct(category.id, 'Happy Path Keyboard', [
      { skuCode: uniqueCode('HAPPY'), price: 89.9, quantity: 10 },
    ]);
    const sale = await createScheduledSale('Happy Path Sale', product.skus[0].id, 49.9, 5);
    await makeSaleActive(sale.id);

    const added = await addItem(customerOneToken, product.skus[0].id);
    expect(added.items).toHaveLength(1);
    expect(added.items[0]).toMatchObject({
      price: 49.9,
      regularPrice: 89.9,
      priceSource: 'FLASH_SALE',
      flashSaleId: sale.id,
      flashSaleItemId: sale.items[0].id,
    });

    const key = randomUUID();
    const first = await checkout(customerOneToken, added.id, key);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('COMPLETED');
    expect(first.body.cart.status).toBe('CHECKED_OUT');

    const replay = await checkout(customerOneToken, added.id, key);
    expect(replay.status).toBe(200);
    expect(replay.body.checkoutId).toBe(first.body.checkoutId);
    expect(replay.body.orderId).toBe(first.body.orderId);

    const order = await databases.order.order.findUniqueOrThrow({
      where: { checkoutId: first.body.checkoutId },
      include: { items: true },
    });
    expect(order.totalAmount.toFixed(2)).toBe('49.90');
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      priceSource: 'FLASH_SALE',
      flashSaleId: BigInt(sale.id),
      flashSaleItemId: BigInt(sale.items[0].id),
    });
    expect(order.items[0].price.toFixed(2)).toBe('49.90');
    expect(order.items[0].regularPrice?.toFixed(2)).toBe('89.90');

    await verifyCompletedCheckout(first.body.checkoutId);
    await verifySaleCounters(sale.items[0].id);
    await verifyNoNegativeInventoryCounters();
  });

  it('keeps regular checkout behavior and does not touch flash-sale rows', async () => {
    const category = await createCategory('regular');
    regularProduct = await createProduct(category.id, 'Regular Mouse', [
      { skuCode: uniqueCode('REGULAR'), price: 25.5, quantity: 12 },
    ]);
    const saleRowsBefore = await databases.inventory.flashSaleStock.count();
    const added = await addItem(customerTwoToken, regularProduct.skus[0].id);
    expect(added.items[0]).toMatchObject({
      price: 25.5,
      regularPrice: 25.5,
      priceSource: 'REGULAR',
      flashSaleId: null,
      flashSaleItemId: null,
    });

    regularCheckoutKey = randomUUID();
    const result = await checkout(customerTwoToken, added.id, regularCheckoutKey);
    expect(result.status).toBe(200);

    const order = await databases.order.order.findUniqueOrThrow({
      where: { checkoutId: result.body.checkoutId },
      include: { items: true },
    });
    expect(order.totalAmount.toFixed(2)).toBe('25.50');
    expect(order.items[0].priceSource).toBe('REGULAR');
    expect(order.items[0].flashSaleId).toBeNull();
    expect(await databases.inventory.flashSaleStock.count()).toBe(saleRowsBefore);

    await verifyCompletedCheckout(result.body.checkoutId);
    await expectProductEventProcessed(regularProduct.id);
    await verifyNoNegativeInventoryCounters();
  });

  it('allows only one of two customers to buy a one-unit sale allocation', async () => {
    const category = await createCategory('sold-out');
    const product = await createProduct(category.id, 'Limited Headset', [
      { skuCode: uniqueCode('SOLDOUT'), price: 60, quantity: 5 },
    ]);
    const sale = await createScheduledSale('One Unit Sale', product.skus[0].id, 39, 1);
    await makeSaleActive(sale.id);

    const [firstCart, secondCart] = await Promise.all([
      addItem(customerOneToken, product.skus[0].id),
      addItem(customerThreeToken, product.skus[0].id),
    ]);
    const [first, second] = await Promise.all([
      checkout(customerOneToken, firstCart.id, randomUUID()),
      checkout(customerThreeToken, secondCart.id, randomUUID()),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const winner = first.status === 200 ? first : second;
    const loser = first.status === 409 ? first : second;
    expect((loser.body as unknown as ErrorResponse).code).toBe('FLASH_SALE_SOLD_OUT');

    await verifyCompletedCheckout(winner.body.checkoutId);
    await verifySaleCounters(sale.items[0].id);
    const saleStock = await databases.inventory.flashSaleStock.findUniqueOrThrow({
      where: { flashSaleItemId: BigInt(sale.items[0].id) },
    });
    expect(saleStock.soldQuantity).toBe(1);
    expect(saleStock.reservedQuantity).toBe(0);
    await verifyNoNegativeInventoryCounters();
  });

  it('rejects checkout after sale expiry without creating an order or changing stock', async () => {
    const category = await createCategory('expiry');
    const product = await createProduct(category.id, 'Expiring Speaker', [
      { skuCode: uniqueCode('EXPIRE'), price: 75, quantity: 4 },
    ]);
    const sale = await createScheduledSale('Expiring Sale', product.skus[0].id, 45, 2);
    await makeSaleActive(sale.id);
    const cart = await addItem(customerThreeToken, product.skus[0].id);

    await expireSale(sale.id);
    const before = await inventorySnapshot(product.skus[0].id, sale.items[0].id);
    const orderCountBefore = await databases.order.order.count();
    const result = await checkout(customerThreeToken, cart.id, randomUUID());

    expect(result.status).toBe(409);
    expect((result.body as unknown as ErrorResponse).code).toBe('FLASH_SALE_ENDED');
    expect(await databases.order.order.count()).toBe(orderCountBefore);
    expect(await inventorySnapshot(product.skus[0].id, sale.items[0].id)).toEqual(before);
    await verifyNoNegativeInventoryCounters();
  });

  it('rejects reuse of an idempotency key for another cart', async () => {
    const newCart = await addItem(customerTwoToken, regularProduct.skus[0].id);
    const conflict = await checkout(customerTwoToken, newCart.id, regularCheckoutKey);
    expect(conflict.status).toBe(409);
    expect(
      await databases.cart.checkoutAttempt.count({ where: { cartId: BigInt(newCart.id) } }),
    ).toBe(0);
  });

  it('commits product and sale APIs during a broker outage and catches up after recovery', async () => {
    await docker('stop', redpandaContainer);
    try {
      const category = await createCategory('broker-outage');
      const productResponse = await request<ProductResponse>('/api/products', {
        method: 'POST',
        token: adminToken,
        body: productRequest(category.id, 'Offline Broker Keyboard', [
          { skuCode: uniqueCode('OFFLINE'), price: 110, quantity: 7 },
        ]),
      });
      expect(productResponse.status).toBe(201);

      const saleResponse = await request<FlashSaleResponse>('/api/flash-sales', {
        method: 'POST',
        token: adminToken,
        body: saleRequest('Offline Broker Sale', productResponse.body.skus[0].id, 80, 3),
      });
      expect(saleResponse.status).toBe(201);
      const scheduleResponse = await request<FlashSaleResponse>(
        `/api/flash-sales/${saleResponse.body.id}/schedule`,
        { method: 'POST', token: adminToken },
      );
      expect(scheduleResponse.status).toBe(201);

      const outboxRows = await databases.product.productOutboxEvent.findMany({
        where: {
          OR: [
            { aggregateType: 'PRODUCT', aggregateId: BigInt(productResponse.body.id) },
            { aggregateType: 'FLASH_SALE', aggregateId: BigInt(saleResponse.body.id) },
          ],
        },
      });
      expect(outboxRows).toHaveLength(2);
      expect(outboxRows.every((row) => row.status !== 'PUBLISHED')).toBe(true);
      expect(
        await databases.inventory.inventoryStock.count({
          where: { productId: BigInt(productResponse.body.id) },
        }),
      ).toBe(0);
      expect(
        await databases.inventory.flashSaleStock.count({
          where: { flashSaleId: BigInt(saleResponse.body.id) },
        }),
      ).toBe(0);

      const health = await fetch(`${gatewayUrl}/health`);
      expect(health.status).toBe(200);

      await docker('start', redpandaContainer);
      await waitForRedpanda(redpandaContainer);
      await waitForProductProjection(productResponse.body.id, productResponse.body.skus.length);
      await waitForSaleProjection(saleResponse.body.id, saleResponse.body.items.length);
      await waitUntil(async () => {
        const count = await databases.product.productOutboxEvent.count({
          where: {
            status: 'PUBLISHED',
            OR: [
              { aggregateType: 'PRODUCT', aggregateId: BigInt(productResponse.body.id) },
              { aggregateType: 'FLASH_SALE', aggregateId: BigInt(saleResponse.body.id) },
            ],
          },
        });
        return count === 2;
      }, 'outbox events to publish after broker recovery');

      await expectProductEventProcessed(productResponse.body.id);
      await expectSaleEventProcessed(saleResponse.body.id);
      await verifyNoNegativeInventoryCounters();
    } finally {
      await docker('start', redpandaContainer).catch(() => undefined);
      await waitForRedpanda(redpandaContainer).catch(() => undefined);
    }
  });

  async function login(email: string): Promise<string> {
    const response = await request<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password: PASSWORD },
    });
    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
    return response.body.token;
  }

  async function createCategory(label: string): Promise<{ id: number }> {
    const suffix = randomUUID().slice(0, 8);
    const response = await request<{ id: number }>('/api/categories', {
      method: 'POST',
      token: adminToken,
      body: { name: `E2E ${label} ${suffix}`, slug: `e2e-${label}-${suffix}` },
    });
    expect(response.status).toBe(201);
    return response.body;
  }

  async function createProduct(
    categoryId: number,
    name: string,
    skus: Array<{ skuCode: string; price: number; quantity: number }>,
  ): Promise<ProductResponse> {
    const response = await request<ProductResponse>('/api/products', {
      method: 'POST',
      token: adminToken,
      body: productRequest(categoryId, name, skus),
    });
    expect(response.status).toBe(201);
    await waitForProductProjection(response.body.id, response.body.skus.length);
    return response.body;
  }

  async function createScheduledSale(
    name: string,
    productSkuId: number,
    salePrice: number,
    stockLimit: number,
  ): Promise<FlashSaleResponse> {
    const created = await request<FlashSaleResponse>('/api/flash-sales', {
      method: 'POST',
      token: adminToken,
      body: saleRequest(name, productSkuId, salePrice, stockLimit),
    });
    expect(created.status).toBe(201);
    const scheduled = await request<FlashSaleResponse>(
      `/api/flash-sales/${created.body.id}/schedule`,
      { method: 'POST', token: adminToken },
    );
    expect(scheduled.status).toBe(201);
    await waitForSaleProjection(created.body.id, created.body.items.length);
    return created.body;
  }

  async function addItem(token: string, productSkuId: number): Promise<CartResponse> {
    const response = await request<CartResponse>('/api/cart-items', {
      method: 'POST',
      token,
      body: { productSkuId, quantity: 1 },
    });
    expect(response.status).toBe(201);
    return response.body;
  }

  function checkout<T = CheckoutResponse>(
    token: string,
    cartId: number,
    key: string,
  ): Promise<ApiResponse<T>> {
    return request<T>(`/api/carts/${cartId}/checkout`, {
      method: 'POST',
      token,
      headers: { 'Idempotency-Key': key },
    });
  }

  async function waitForProductProjection(productId: number, expectedSkus: number): Promise<void> {
    await waitUntil(
      async () =>
        (await databases.inventory.inventoryStock.count({
          where: { productId: BigInt(productId) },
        })) === expectedSkus,
      `inventory projection for product ${productId}`,
    );
  }

  async function waitForSaleProjection(flashSaleId: number, expectedItems: number): Promise<void> {
    await waitUntil(
      async () =>
        (await databases.inventory.flashSaleStock.count({
          where: { flashSaleId: BigInt(flashSaleId) },
        })) === expectedItems,
      `inventory projection for flash sale ${flashSaleId}`,
    );
  }

  async function makeSaleActive(flashSaleId: number): Promise<void> {
    const startsAt = new Date(Date.now() - 60_000);
    const endsAt = new Date(Date.now() + 5 * 60_000);
    // Scheduling enforces a five-minute lead time. Moving both owned projections is
    // controlled test setup so the suite can exercise the active window immediately.
    await databases.product.flashSale.update({
      where: { id: BigInt(flashSaleId) },
      data: { startsAt, endsAt },
    });
    await databases.inventory.flashSaleStock.updateMany({
      where: { flashSaleId: BigInt(flashSaleId) },
      data: { startsAt, endsAt },
    });
  }

  async function expireSale(flashSaleId: number): Promise<void> {
    const startsAt = new Date(Date.now() - 10 * 60_000);
    const endsAt = new Date(Date.now() - 1_000);
    await databases.product.flashSale.update({
      where: { id: BigInt(flashSaleId) },
      data: { startsAt, endsAt },
    });
    await databases.inventory.flashSaleStock.updateMany({
      where: { flashSaleId: BigInt(flashSaleId) },
      data: { startsAt, endsAt },
    });
  }

  async function verifyCompletedCheckout(checkoutId: string): Promise<void> {
    const attempt = await databases.cart.checkoutAttempt.findUniqueOrThrow({
      where: { id: checkoutId },
    });
    expect(attempt.status).toBe('COMPLETED');
    expect(attempt.orderId).not.toBeNull();
    const orders = await databases.order.order.findMany({ where: { checkoutId } });
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(attempt.orderId);
    const reservations = await databases.inventory.stockReservation.findMany({
      where: { checkoutId },
    });
    expect(reservations.length).toBeGreaterThan(0);
    expect(reservations.every((reservation) => reservation.status === 'COMMITTED')).toBe(true);
  }

  async function verifySaleCounters(flashSaleItemId: number): Promise<void> {
    const stock = await databases.inventory.flashSaleStock.findUniqueOrThrow({
      where: { flashSaleItemId: BigInt(flashSaleItemId) },
    });
    const committed = await databases.inventory.stockReservation.aggregate({
      where: { flashSaleItemId: BigInt(flashSaleItemId), status: 'COMMITTED' },
      _sum: { quantity: true },
    });
    expect(stock.soldQuantity).toBe(committed._sum.quantity ?? 0);
  }

  async function expectProductEventProcessed(productId: number): Promise<void> {
    const outbox = await databases.product.productOutboxEvent.findFirstOrThrow({
      where: { aggregateType: 'PRODUCT', aggregateId: BigInt(productId) },
    });
    expect(
      await databases.inventory.processedProductEvent.count({ where: { eventId: outbox.id } }),
    ).toBe(1);
  }

  async function expectSaleEventProcessed(flashSaleId: number): Promise<void> {
    const outbox = await databases.product.productOutboxEvent.findFirstOrThrow({
      where: { aggregateType: 'FLASH_SALE', aggregateId: BigInt(flashSaleId) },
    });
    expect(
      await databases.inventory.processedFlashSaleEvent.count({ where: { eventId: outbox.id } }),
    ).toBe(1);
  }

  async function verifyNoNegativeInventoryCounters(): Promise<void> {
    const negativeNormal = await databases.inventory.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "inventory_stocks"
      WHERE "available_quantity" < 0 OR "reserved_quantity" < 0
    `;
    const negativeSale = await databases.inventory.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "flash_sale_stocks"
      WHERE "reserved_quantity" < 0
         OR "sold_quantity" < 0
         OR "reserved_quantity" + "sold_quantity" > "quantity_limit"
    `;
    expect(negativeNormal[0].count).toBe(0n);
    expect(negativeSale[0].count).toBe(0n);
  }

  async function inventorySnapshot(productSkuId: number, flashSaleItemId: number) {
    const [normal, sale, reservations, transactions] = await Promise.all([
      databases.inventory.inventoryStock.findUniqueOrThrow({
        where: { productSkuId: BigInt(productSkuId) },
      }),
      databases.inventory.flashSaleStock.findUniqueOrThrow({
        where: { flashSaleItemId: BigInt(flashSaleItemId) },
      }),
      databases.inventory.stockReservation.count({ where: { productSkuId: BigInt(productSkuId) } }),
      databases.inventory.stockTransaction.count({ where: { productSkuId: BigInt(productSkuId) } }),
    ]);
    return {
      available: normal.availableQuantity,
      normalReserved: normal.reservedQuantity,
      saleReserved: sale.reservedQuantity,
      saleSold: sale.soldQuantity,
      reservations,
      transactions,
    };
  }

  async function request<T>(
    path: string,
    options: {
      method?: string;
      token?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${gatewayUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    const body = (text ? JSON.parse(text) : undefined) as T;
    return { status: response.status, body };
  }
});

function productRequest(
  categoryId: number,
  name: string,
  skus: Array<{ skuCode: string; price: number; quantity: number }>,
) {
  return {
    name,
    description: 'Created by the isolated gateway E2E suite.',
    categoryId,
    sellerId: 1,
    status: 'ACTIVE',
    skus: skus.map((sku) => ({ ...sku, status: 'AVAILABLE' })),
  };
}

function saleRequest(name: string, productSkuId: number, salePrice: number, stockLimit: number) {
  return {
    name,
    description: 'Created by the isolated gateway E2E suite.',
    startsAt: new Date(Date.now() + 6 * 60_000).toISOString(),
    endsAt: new Date(Date.now() + 12 * 60_000).toISOString(),
    items: [{ productSkuId, salePrice, stockLimit, maxQuantityPerUser: 1 }],
  };
}

function uniqueCode(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`.toUpperCase();
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  description: string,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Timed out waiting for ${description}.${lastError instanceof Error ? ` ${lastError.message}` : ''}`,
  );
}

async function docker(action: 'start' | 'stop', container: string): Promise<void> {
  await execFileAsync('docker', [action, container], { timeout: 30_000 });
}

async function waitForRedpanda(container: string): Promise<void> {
  await waitUntil(async () => {
    try {
      await execFileAsync('docker', ['exec', container, 'rpk', 'cluster', 'health'], {
        timeout: 2_000,
      });
      return true;
    } catch {
      return false;
    }
  }, 'Redpanda to recover');
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Run this suite with npm run test:e2e.`);
  }
  return value;
}
