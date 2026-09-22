import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaCheckoutAttemptRepository } from '../../apps/cart-service/src/carts/infrastructure/persistence/prisma/checkout-attempt.prisma.repository';
import { PrismaCartRepository } from '../../apps/cart-service/src/carts/infrastructure/persistence/prisma/cart.prisma.repository';
import { PrismaService as CartPrismaService } from '../../apps/cart-service/src/carts/infrastructure/persistence/prisma/prisma.service';
import { CartItemPriceSource } from '../../apps/cart-service/src/carts/domain/enums/cart-item-price-source.enum';
import { CartStatus } from '../../apps/cart-service/src/carts/domain/enums/cart-status.enum';
import { CheckoutConflictError } from '../../apps/cart-service/src/carts/domain/errors/checkout-conflict.error';
import { InvalidCartOperationError } from '../../apps/cart-service/src/carts/domain/errors/invalid-cart-operation.error';
import { PrismaOrderRepository } from '../../apps/order-service/src/orders/infrastructure/persistence/prisma/order.prisma.repository';
import { PrismaService as OrderPrismaService } from '../../apps/order-service/src/orders/infrastructure/persistence/prisma/prisma.service';
import { OrderStatus } from '../../apps/order-service/src/orders/domain/enums/order-status.enum';
import { PaymentStatus } from '../../apps/order-service/src/orders/domain/enums/payment-status.enum';
import { CheckoutIdConflictError } from '../../apps/order-service/src/orders/domain/errors/checkout-id-conflict.error';
import { OrderCreateData } from '../../apps/order-service/src/orders/domain/repositories/order.repository.port';
import {
  cleanIntegrationDatabases,
  createIntegrationPrismaClients,
  disconnectIntegrationPrismaClients,
  IntegrationPrismaClients,
} from './support/prisma-clients';

describe('database-backed checkout idempotency', () => {
  let clients: IntegrationPrismaClients;
  let orders: PrismaOrderRepository;
  let attempts: PrismaCheckoutAttemptRepository;
  let carts: PrismaCartRepository;

  beforeAll(async () => {
    clients = await createIntegrationPrismaClients();
    orders = new PrismaOrderRepository(clients.order as unknown as OrderPrismaService);
    attempts = new PrismaCheckoutAttemptRepository(clients.cart as unknown as CartPrismaService);
    carts = new PrismaCartRepository(clients.cart as unknown as CartPrismaService);
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

  it('converges 20 concurrent order creates and rejects a conflicting replay', async () => {
    const checkoutId = randomUUID();
    const requestHash = 'a'.repeat(64);
    const createData = orderData(checkoutId, requestHash);
    const start = barrier(20);

    const results = await Promise.all(
      Array.from({ length: 20 }, async () => {
        await start.wait();
        return orders.create(createData);
      }),
    );

    expect(new Set(results.map(({ id }) => id.toString()))).toEqual(
      new Set([results[0].id.toString()]),
    );
    expect(await clients.order.order.count()).toBe(1);
    expect(await clients.order.orderItem.count()).toBe(createData.items.length);

    await expect(orders.create(orderData(checkoutId, 'b'.repeat(64)))).rejects.toBeInstanceOf(
      CheckoutIdConflictError,
    );

    const stored = await clients.order.order.findUniqueOrThrow({
      where: { checkoutId },
      include: { items: { orderBy: { productSkuId: 'asc' } } },
    });
    expect(stored.requestHash).toBe(requestHash);
    expect(stored.items).toHaveLength(createData.items.length);
    expect(await clients.order.order.count()).toBe(1);
    expect(await clients.order.orderItem.count()).toBe(createData.items.length);
  });

  it('converges concurrent starts for the same user, cart, and key', async () => {
    const { userId, cartId } = await createCart(100n);
    const idempotencyKey = randomUUID();
    const start = barrier(20);

    const results = await Promise.all(
      Array.from({ length: 20 }, async () => {
        await start.wait();
        return attempts.startOrLoad(userId, cartId, idempotencyKey);
      }),
    );

    expect(new Set(results.map(({ id }) => id))).toEqual(new Set([results[0].id]));
    expect(await clients.cart.checkoutAttempt.count()).toBe(1);
  });

  it('allows one key to win when the same cart is started concurrently', async () => {
    const { userId, cartId } = await createCart(200n);
    const keys = Array.from({ length: 20 }, () => randomUUID());
    const start = barrier(keys.length);

    const results = await Promise.allSettled(
      keys.map(async (key) => {
        await start.wait();
        return attempts.startOrLoad(userId, cartId, key);
      }),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(19);
    expect(rejected.every(({ reason }) => reason instanceof CheckoutConflictError)).toBe(true);
    expect(await clients.cart.checkoutAttempt.count()).toBe(1);
  });

  it('rejects the same user and key when another cart wins concurrently', async () => {
    const userId = 300n;
    const winningCart = await createCart(userId);
    const olderCart = await clients.cart.cart.create({
      data: { userId, status: CartStatus.Abandoned },
    });
    const idempotencyKey = randomUUID();
    const rowLocked = deferred<void>();
    const releaseRow = deferred<void>();
    const blocker = clients.cart.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "carts" WHERE "id" = ${olderCart.id} FOR UPDATE
      `;
      rowLocked.resolve();
      await releaseRow.promise;
    });
    await rowLocked.promise;

    const start = barrier(2);
    const winnerPromise = (async () => {
      await start.wait();
      return attempts.startOrLoad(userId, winningCart.cartId, idempotencyKey);
    })();
    const loserPromise = (async () => {
      await start.wait();
      return attempts.startOrLoad(userId, olderCart.id, idempotencyKey);
    })();
    const loserExpectation = expect(loserPromise).rejects.toThrow(
      'This idempotency key belongs to another cart.',
    );

    const winner = await winnerPromise;
    releaseRow.resolve();
    await blocker;

    await loserExpectation;
    expect(await clients.cart.checkoutAttempt.count()).toBe(1);
    expect(winner.cartId).toBe(winningCart.cartId);
  });

  it('serializes checkout acquisition with cart-item mutation without a partial snapshot', async () => {
    const races = await Promise.all(
      Array.from({ length: 12 }, async (_unused, index) => {
        const userId = BigInt(1_000 + index);
        const { cartId, cartItemId } = await createCart(userId, BigInt(10_000 + index));
        const start = barrier(2);
        const checkoutPromise = (async () => {
          await start.wait();
          return attempts.startOrLoad(userId, cartId, randomUUID());
        })();
        const mutationPromise = (async () => {
          await start.wait();
          return carts.updateItemQuantity(userId, cartItemId, 2);
        })();

        const [checkout, mutation] = await Promise.allSettled([checkoutPromise, mutationPromise]);
        return { cartId, checkout, mutation };
      }),
    );

    for (const race of races) {
      expect(race.checkout.status).toBe('fulfilled');
      if (race.checkout.status !== 'fulfilled') continue;

      const snapshotQuantity = race.checkout.value.itemsSnapshot[0].quantity;
      const storedItem = await clients.cart.cartItem.findFirstOrThrow({
        where: { cartId: race.cartId },
      });

      if (race.mutation.status === 'fulfilled') {
        expect(snapshotQuantity).toBe(2);
        expect(storedItem.quantity).toBe(2);
      } else {
        expect(race.mutation.reason).toBeInstanceOf(InvalidCartOperationError);
        expect(snapshotQuantity).toBe(1);
        expect(storedItem.quantity).toBe(1);
      }
    }
  });

  it('lets two reconciliation workers claim disjoint attempts', async () => {
    const attemptIds = await createPendingAttempts(20, 2_000n);
    const now = new Date('2026-09-22T08:00:00.000Z');
    const leaseUntil = new Date('2026-09-22T08:00:30.000Z');

    const [workerA, workerB] = await Promise.all([
      attempts.claimDue({
        limit: 10,
        leaseOwner: 'worker-a',
        leaseUntil,
        maxAttempts: 5,
        now,
      }),
      attempts.claimDue({
        limit: 10,
        leaseOwner: 'worker-b',
        leaseUntil,
        maxAttempts: 5,
        now,
      }),
    ]);

    const claimedA = new Set(workerA.map(({ id }) => id));
    const claimedB = new Set(workerB.map(({ id }) => id));
    expect(workerA).toHaveLength(10);
    expect(workerB).toHaveLength(10);
    expect([...claimedA].some((id) => claimedB.has(id))).toBe(false);
    expect(new Set([...claimedA, ...claimedB])).toEqual(new Set(attemptIds));

    await expect(
      attempts.claimDue({
        limit: 20,
        leaseOwner: 'worker-c',
        leaseUntil,
        maxAttempts: 5,
        now,
      }),
    ).resolves.toEqual([]);
  });

  it('protects an active lease and reclaims it after expiry', async () => {
    const [attemptId] = await createPendingAttempts(1, 3_000n);
    const claimed = await attempts.claimDue({
      limit: 1,
      leaseOwner: 'worker-a',
      leaseUntil: new Date('2026-09-22T08:00:30.000Z'),
      maxAttempts: 5,
      now: new Date('2026-09-22T08:00:00.000Z'),
    });
    expect(claimed.map(({ id }) => id)).toEqual([attemptId]);

    await expect(
      attempts.claimDue({
        limit: 1,
        leaseOwner: 'worker-b',
        leaseUntil: new Date('2026-09-22T08:00:40.000Z'),
        maxAttempts: 5,
        now: new Date('2026-09-22T08:00:10.000Z'),
      }),
    ).resolves.toEqual([]);

    const reclaimed = await attempts.claimDue({
      limit: 1,
      leaseOwner: 'worker-b',
      leaseUntil: new Date('2026-09-22T08:01:10.000Z'),
      maxAttempts: 5,
      now: new Date('2026-09-22T08:00:40.000Z'),
    });
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]).toMatchObject({ id: attemptId, leaseOwner: 'worker-b' });
  });

  it('claims only due attempts below the automatic retry limit', async () => {
    const [futureId, exhaustedId] = await createPendingAttempts(2, 4_000n);
    await clients.cart.checkoutAttempt.update({
      where: { id: futureId },
      data: {
        status: 'RECONCILIATION_REQUIRED',
        nextRetryAt: new Date('2026-09-22T08:01:00.000Z'),
      },
    });
    await clients.cart.checkoutAttempt.update({
      where: { id: exhaustedId },
      data: {
        status: 'RECONCILIATION_REQUIRED',
        retryCount: 5,
        nextRetryAt: null,
        lastError: 'Maximum automatic recovery attempts reached.',
      },
    });

    await expect(
      attempts.claimDue({
        limit: 10,
        leaseOwner: 'worker-a',
        leaseUntil: new Date('2026-09-22T08:00:30.000Z'),
        maxAttempts: 5,
        now: new Date('2026-09-22T08:00:00.000Z'),
      }),
    ).resolves.toEqual([]);

    const due = await attempts.claimDue({
      limit: 10,
      leaseOwner: 'worker-a',
      leaseUntil: new Date('2026-09-22T08:02:30.000Z'),
      maxAttempts: 5,
      now: new Date('2026-09-22T08:02:00.000Z'),
    });
    expect(due.map(({ id }) => id)).toEqual([futureId]);
  });

  async function createPendingAttempts(count: number, firstUserId: bigint): Promise<string[]> {
    const created: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const userId = firstUserId + BigInt(index);
      const { cartId } = await createCart(userId, 20_000n + BigInt(index));
      const checkout = await attempts.startOrLoad(userId, cartId, randomUUID());
      created.push(checkout.id);
    }
    return created;
  }

  async function createCart(
    userId: bigint,
    productSkuId = 5_001n,
  ): Promise<{ userId: bigint; cartId: bigint; cartItemId: bigint }> {
    const cart = await clients.cart.cart.create({
      data: {
        userId,
        items: {
          create: {
            productId: productSkuId,
            productName: 'Keyboard',
            productSkuId,
            skuCode: `SKU-${productSkuId}`,
            price: 19.9,
            regularPrice: 19.9,
            priceSource: CartItemPriceSource.Regular,
            quantity: 1,
          },
        },
      },
      include: { items: true },
    });

    return { userId, cartId: cart.id, cartItemId: cart.items[0].id };
  }
});

function orderData(checkoutId: string, requestHash: string): OrderCreateData {
  return {
    userId: 10n,
    checkoutId,
    cartId: 20n,
    requestHash,
    requestHashVersion: 2,
    totalAmount: 49.8,
    status: OrderStatus.Created,
    paymentStatus: PaymentStatus.Pending,
    shippingAddress: null,
    items: [
      {
        productName: 'Keyboard',
        productSkuId: 101n,
        skuCode: 'KEYBOARD-BLACK',
        imageUrl: null,
        price: 19.9,
        regularPrice: 39.9,
        priceSource: 'FLASH_SALE',
        flashSaleId: 50n,
        flashSaleItemId: 501n,
        saleEndsAt: new Date('2026-09-30T00:00:00.000Z'),
        quantity: 1,
      },
      {
        productName: 'Mouse',
        productSkuId: 102n,
        skuCode: 'MOUSE-BLACK',
        imageUrl: null,
        price: 29.9,
        regularPrice: 29.9,
        priceSource: 'REGULAR',
        flashSaleId: null,
        flashSaleItemId: null,
        saleEndsAt: null,
        quantity: 1,
      },
    ],
  };
}

function barrier(participants: number): { wait(): Promise<void> } {
  const gate = deferred<void>();
  let arrived = 0;
  return {
    async wait(): Promise<void> {
      arrived += 1;
      if (arrived === participants) gate.resolve();
      await gate.promise;
    },
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
