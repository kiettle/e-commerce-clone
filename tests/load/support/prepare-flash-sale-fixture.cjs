#!/usr/bin/env node

const { randomUUID } = require('node:crypto');
const { writeFile } = require('node:fs/promises');
const { dirname, resolve } = require('node:path');
const { mkdir } = require('node:fs/promises');
const bcrypt = require('bcrypt');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient: AuthPrismaClient } = require('../../../prisma/generated/auth/client');
const { PrismaClient: ProductPrismaClient } = require('../../../prisma/generated/product/client');
const {
  PrismaClient: InventoryPrismaClient,
} = require('../../../prisma/generated/inventory/client');

const profile = process.argv[2] ?? 'smoke';
const outputPath = resolve(process.argv[3] ?? 'tests/load/.fixture.json');
const gatewayUrl = (process.env.LOAD_GATEWAY_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
const userCount = integerEnvironment('LOAD_VUS', defaultUserCount(profile), 1, 10_000);
const stockLimit = integerEnvironment(
  'LOAD_STOCK_LIMIT',
  profile === 'concurrency' ? 20 : userCount,
  1,
  1_000_000,
);
const baseInventory = integerEnvironment(
  'LOAD_BASE_INVENTORY',
  profile === 'concurrency' ? 1_000 : Math.max(100, userCount, stockLimit),
  stockLimit,
  10_000_000,
);
const password = process.env.LOAD_USER_PASSWORD ?? 'load-test-password';
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;

const auth = createClient(AuthPrismaClient, requiredEnvironment('AUTH_DATABASE_URL'));
const product = createClient(ProductPrismaClient, requiredEnvironment('PRODUCT_DATABASE_URL'));
const inventory = createClient(
  InventoryPrismaClient,
  requiredEnvironment('INVENTORY_DATABASE_URL'),
);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  await Promise.all([auth.$connect(), product.$connect(), inventory.$connect()]);
  try {
    const adminToken = await login(
      process.env.LOAD_ADMIN_EMAIL ?? 'testuser@test.com',
      process.env.LOAD_ADMIN_PASSWORD ?? 'password123',
    );
    const users = await createUsers();
    const category = await api('/api/categories', {
      method: 'POST',
      token: adminToken,
      body: {
        name: `Load test ${runId}`,
        slug: `load-test-${runId}`,
      },
      expectedStatus: 201,
    });
    const productResponse = await api('/api/products', {
      method: 'POST',
      token: adminToken,
      body: {
        name: `Load test product ${runId}`,
        description: 'Dedicated flash-sale load-test fixture.',
        categoryId: category.id,
        sellerId: 1,
        status: 'ACTIVE',
        skus: [
          {
            skuCode: `LOAD-${runId}`.toUpperCase(),
            price: 100,
            status: 'AVAILABLE',
            quantity: baseInventory,
          },
        ],
      },
      expectedStatus: 201,
    });
    const productSkuId = productResponse.skus[0].id;
    await waitUntil(
      async () =>
        (await inventory.inventoryStock.count({
          where: { productSkuId: BigInt(productSkuId) },
        })) === 1,
      'product inventory projection',
    );

    const startsAt = new Date(Date.now() + 6 * 60_000);
    const endsAt = new Date(Date.now() + 40 * 60_000);
    const sale = await api('/api/flash-sales', {
      method: 'POST',
      token: adminToken,
      body: {
        name: `Load test sale ${runId}`,
        description: 'Dedicated flash-sale load-test fixture.',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        items: [
          {
            productSkuId,
            salePrice: 50,
            stockLimit,
            maxQuantityPerUser: 1,
          },
        ],
      },
      expectedStatus: 201,
    });
    await api(`/api/flash-sales/${sale.id}/schedule`, {
      method: 'POST',
      token: adminToken,
      expectedStatus: 201,
    });
    await waitUntil(
      async () =>
        (await inventory.flashSaleStock.count({
          where: { flashSaleId: BigInt(sale.id) },
        })) === 1,
      'flash-sale inventory projection',
    );

    const activeStartsAt = new Date(Date.now() - 60_000);
    const activeEndsAt = new Date(Date.now() + 30 * 60_000);
    await product.flashSale.update({
      where: { id: BigInt(sale.id) },
      data: { startsAt: activeStartsAt, endsAt: activeEndsAt },
    });
    await inventory.flashSaleStock.updateMany({
      where: { flashSaleId: BigInt(sale.id) },
      data: { startsAt: activeStartsAt, endsAt: activeEndsAt },
    });

    const preparedUsers = await prepareTokensAndCarts(users, productSkuId);
    const fixture = {
      version: 1,
      runId,
      profile,
      gatewayUrl,
      userCount,
      stockLimit,
      baseInventory,
      productId: productResponse.id,
      productName: productResponse.name,
      productSkuId,
      flashSaleId: sale.id,
      flashSaleItemId: sale.items[0].id,
      preparedAt: new Date().toISOString(),
      users: preparedUsers,
    };

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, { mode: 0o600 });
    console.log(`[load] Prepared ${userCount} users and carts in ${outputPath}.`);
  } finally {
    await Promise.allSettled([auth.$disconnect(), product.$disconnect(), inventory.$disconnect()]);
  }
}

async function createUsers() {
  const maximum = await auth.user.aggregate({ _max: { id: true } });
  const firstId = (maximum._max.id ?? 0n) + 1n;
  const passwordHash = await bcrypt.hash(password, 6);
  const users = Array.from({ length: userCount }, (_, index) => ({
    id: firstId + BigInt(index),
    email: `load-${runId}-${index + 1}@example.test`,
    password: passwordHash,
    role: 'USER',
  }));
  await auth.user.createMany({ data: users });
  return users;
}

async function prepareTokensAndCarts(users, productSkuId) {
  const prepared = [];
  for (let offset = 0; offset < users.length; offset += 10) {
    const batch = users.slice(offset, offset + 10);
    const results = await Promise.all(
      batch.map(async (user) => {
        const token = await login(user.email, password);
        const cart = await api('/api/cart-items', {
          method: 'POST',
          token,
          body: { productSkuId, quantity: 1 },
          expectedStatus: 201,
        });
        const item = cart.items.find((candidate) => candidate.productSkuId === productSkuId);
        if (!item || item.priceSource !== 'FLASH_SALE') {
          throw new Error(`User ${user.email} did not receive a flash-sale cart snapshot.`);
        }
        return {
          userId: user.id.toString(),
          email: user.email,
          token,
          cartId: cart.id,
          idempotencyKey: randomUUID(),
        };
      }),
    );
    prepared.push(...results);
  }
  return prepared;
}

async function login(email, userPassword) {
  const response = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password: userPassword },
    expectedStatus: 201,
  });
  if (!response.token) {
    throw new Error(`Login for ${email} did not return a token.`);
  }
  return response.token;
}

async function api(path, options) {
  const headers = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${gatewayUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (response.status !== options.expectedStatus) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

async function waitUntil(predicate, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

function createClient(Client, connectionString) {
  return new Client({ adapter: new PrismaPg({ connectionString }) });
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for load-test setup.`);
  return value;
}

function integerEnvironment(name, fallback, minimum, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function defaultUserCount(selectedProfile) {
  if (selectedProfile === 'concurrency') return 100;
  if (selectedProfile === 'retry-storm') return 20;
  if (selectedProfile === 'reads') return 10;
  return 5;
}
