#!/usr/bin/env node

const { readFile, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient: CartPrismaClient } = require('../../../prisma/generated/cart/client');
const {
  PrismaClient: InventoryPrismaClient,
} = require('../../../prisma/generated/inventory/client');
const { PrismaClient: OrderPrismaClient } = require('../../../prisma/generated/order/client');

const fixturePath = resolve(requiredArgument(2, 'fixture path'));
const resultPath = resolve(requiredArgument(3, 'k6 result path'));
const invariantPath = resolve(process.argv[4] ?? 'tests/load/.invariants.json');
const cart = createClient(CartPrismaClient, requiredEnvironment('CART_DATABASE_URL'));
const inventory = createClient(
  InventoryPrismaClient,
  requiredEnvironment('INVENTORY_DATABASE_URL'),
);
const order = createClient(OrderPrismaClient, requiredEnvironment('ORDER_DATABASE_URL'));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const k6Result = JSON.parse(await readFile(resultPath, 'utf8'));
  const userIds = fixture.users.map((user) => BigInt(user.userId));
  const cartIds = fixture.users.map((user) => BigInt(user.cartId));
  const isReadProfile = fixture.profile === 'reads';
  const expectedSuccesses = isReadProfile
    ? 0
    : fixture.profile === 'concurrency'
      ? Math.min(fixture.userCount, fixture.stockLimit)
      : fixture.userCount;
  const expectedConflicts =
    fixture.profile === 'concurrency' ? fixture.userCount - expectedSuccesses : 0;

  await Promise.all([cart.$connect(), inventory.$connect(), order.$connect()]);
  try {
    const [attempts, orders, reservations, normalStock, saleStock, orderItemCount] =
      await Promise.all([
        cart.checkoutAttempt.findMany({ where: { userId: { in: userIds } } }),
        order.order.findMany({ where: { userId: { in: userIds } } }),
        inventory.stockReservation.findMany({
          where: {
            cartId: { in: cartIds },
            productSkuId: BigInt(fixture.productSkuId),
          },
        }),
        inventory.inventoryStock.findUniqueOrThrow({
          where: { productSkuId: BigInt(fixture.productSkuId) },
        }),
        inventory.flashSaleStock.findUniqueOrThrow({
          where: { flashSaleItemId: BigInt(fixture.flashSaleItemId) },
        }),
        order.orderItem.count({
          where: { productSkuId: BigInt(fixture.productSkuId) },
        }),
      ]);

    const completed = attempts.filter((attempt) => attempt.status === 'COMPLETED');
    const failed = attempts.filter((attempt) => attempt.status === 'FAILED');
    const committed = reservations.filter((reservation) => reservation.status === 'COMMITTED');
    const uniqueOrderCheckouts = new Set(orders.map((entry) => entry.checkoutId)).size;
    const uniqueOrderUsers = new Set(orders.map((entry) => entry.userId.toString())).size;
    const uniqueReservationCarts = new Set(reservations.map((entry) => entry.cartId.toString()))
      .size;
    const orderById = new Map(orders.map((entry) => [entry.id.toString(), entry]));
    const completedByCart = new Map(completed.map((entry) => [entry.cartId.toString(), entry]));

    assertEqual(expectedSuccesses, completed.length, 'completed checkout count');
    assertEqual(expectedSuccesses, orders.length, 'order count');
    assertEqual(expectedSuccesses, uniqueOrderCheckouts, 'unique order checkout count');
    assertEqual(expectedSuccesses, uniqueOrderUsers, 'unique order user count');
    assertEqual(expectedSuccesses, orderItemCount, 'order-item count');
    assertEqual(expectedSuccesses, reservations.length, 'reservation count');
    assertEqual(expectedSuccesses, committed.length, 'committed reservation count');
    assertEqual(expectedSuccesses, uniqueReservationCarts, 'unique reservation cart count');
    assertEqual(expectedSuccesses, saleStock.soldQuantity, 'sale sold quantity');
    assertEqual(0, saleStock.reservedQuantity, 'sale reserved quantity');
    assertEqual(0, normalStock.reservedQuantity, 'normal reserved quantity');
    assertEqual(
      fixture.baseInventory - expectedSuccesses,
      normalStock.availableQuantity,
      'normal available quantity',
    );
    for (const attempt of completed) {
      const persistedOrder = attempt.orderId
        ? orderById.get(attempt.orderId.toString())
        : undefined;
      if (
        !persistedOrder ||
        persistedOrder.checkoutId !== attempt.id ||
        persistedOrder.userId !== attempt.userId
      ) {
        throw new Error(`Checkout ${attempt.id} is not linked to its one persisted order.`);
      }
    }
    for (const reservation of reservations) {
      const attempt = completedByCart.get(reservation.cartId.toString());
      if (!attempt || reservation.checkoutId !== attempt.id) {
        throw new Error(
          `Reservation for cart ${reservation.cartId} is not linked to its checkout.`,
        );
      }
    }

    if (isReadProfile) {
      assertEqual(0, attempts.length, 'read profile checkout-attempt count');
    } else {
      assertEqual(fixture.userCount, attempts.length, 'checkout-attempt count');
      assertEqual(expectedConflicts, failed.length, 'terminal business-conflict count');
    }

    const unexpected5xx = metricValue(k6Result, 'unexpected_5xx', 'count');
    const k6SuccessfulUsers = metricValue(k6Result, 'checkout_user_successes', 'count');
    const k6BusinessConflicts = metricValue(k6Result, 'business_conflicts', 'count');
    const k6SoldOutConflicts = metricValue(k6Result, 'sold_out_conflicts', 'count');
    const k6PurchaseLimitConflicts = metricValue(
      k6Result,
      'purchase_limit_conflicts',
      'count',
    );
    assertEqual(0, unexpected5xx, 'unexpected HTTP 5xx count');
    if (!isReadProfile) {
      assertEqual(expectedSuccesses, k6SuccessfulUsers, 'k6 successful-user count');
      assertEqual(expectedConflicts, k6BusinessConflicts, 'k6 business-conflict count');
    }
    if (fixture.profile === 'concurrency') {
      assertEqual(expectedConflicts, k6SoldOutConflicts, 'k6 sold-out conflict count');
      assertEqual(0, k6PurchaseLimitConflicts, 'k6 purchase-limit conflict count');
    }
    if (fixture.profile === 'retry-storm') {
      assertEqual(0, metricValue(k6Result, 'retry_mismatches', 'count'), 'retry mismatch count');
    }

    const negativeNormal = await inventory.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM "inventory_stocks"
      WHERE "available_quantity" < 0 OR "reserved_quantity" < 0
    `;
    const negativeSale = await inventory.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM "flash_sale_stocks"
      WHERE "reserved_quantity" < 0
         OR "sold_quantity" < 0
         OR "reserved_quantity" + "sold_quantity" > "quantity_limit"
    `;
    assertEqual(0n, negativeNormal[0].count, 'negative normal inventory rows');
    assertEqual(0n, negativeSale[0].count, 'invalid sale inventory rows');

    const duplicateOrderCount = orders.length - uniqueOrderCheckouts;
    const duplicateBuyerPurchaseCount = orders.length - uniqueOrderUsers;

    const verification = {
      profile: fixture.profile,
      verifiedAt: new Date().toISOString(),
      expectedSuccesses,
      completedCheckouts: completed.length,
      orders: orders.length,
      committedReservations: committed.length,
      businessConflicts: expectedConflicts,
      soldOutConflicts: k6SoldOutConflicts,
      purchaseLimitConflicts: k6PurchaseLimitConflicts,
      duplicateOrderCount,
      duplicateBuyerPurchaseCount,
      saleSoldQuantity: saleStock.soldQuantity,
      saleReservedQuantity: saleStock.reservedQuantity,
      normalAvailableQuantity: normalStock.availableQuantity,
      normalReservedQuantity: normalStock.reservedQuantity,
      negativeNormalInventoryRows: Number(negativeNormal[0].count),
      invalidSaleCounterRows: Number(negativeSale[0].count),
      invariantStatus: 'PASSED',
    };
    await writeFile(invariantPath, `${JSON.stringify(verification, null, 2)}\n`);
    console.log(
      `[load] Invariants passed: ${expectedSuccesses} completed, ${expectedConflicts} business conflicts.`,
    );
  } finally {
    await Promise.allSettled([cart.$disconnect(), inventory.$disconnect(), order.$disconnect()]);
  }
}

function metricValue(result, metric, value) {
  return result.metrics?.[metric]?.values?.[value] ?? 0;
}

function assertEqual(expected, actual, description) {
  if (actual !== expected) {
    throw new Error(`${description}: expected ${expected}, received ${actual}.`);
  }
}

function createClient(Client, connectionString) {
  return new Client({ adapter: new PrismaPg({ connectionString }) });
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for invariant verification.`);
  return value;
}

function requiredArgument(index, name) {
  const value = process.argv[index];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
