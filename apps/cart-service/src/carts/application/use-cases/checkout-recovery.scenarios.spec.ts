import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { CartEntity } from '../../domain/entities/cart.entity';
import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { ReconciliationAction } from '../../domain/enums/reconciliation-action.enum';
import { CheckoutTerminalError } from '../../domain/errors/checkout-terminal.error';
import { InventoryCommitFailedError } from '../../domain/errors/inventory-commit-failed.error';
import { InventoryReleaseFailedError } from '../../domain/errors/inventory-release-failed.error';
import { OrderCreationFailedError } from '../../domain/errors/order-creation-failed.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { CheckoutAttemptRepositoryPort } from '../../domain/repositories/checkout-attempt.repository.port';
import { CheckoutFailureLoggerPort } from '../ports/checkout-failure-logger.port';
import { InventoryStockPort } from '../ports/inventory-stock.port';
import { OrderCreateResult, OrderCreatorPort } from '../ports/order-creator.port';
import { CheckoutCartUseCase } from './checkout-cart.use-case';

describe('checkout recovery scenarios', () => {
  const command = {
    userId: 10n,
    cartId: 20n,
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
  };

  beforeEach(() => vi.restoreAllMocks());

  it('recovers a lost order response by finding the original order without releasing stock', async () => {
    const harness = recoveryHarness(checkOrderAttempt());
    let storedOrder: OrderCreateResult | null = null;
    harness.orders.getOrderByCheckoutId.mockImplementation(async () => {
      if (!storedOrder) throw new OrderCreationFailedError('Order not found.', 'NOT_FOUND');
      return storedOrder;
    });
    harness.orders.createOrder.mockImplementation(async () => {
      storedOrder = { orderId: 501n, status: 'CREATED' };
      throw new OrderCreationFailedError('Order response was lost.', 'UNCERTAIN');
    });

    await expect(harness.checkout.execute(command)).resolves.toMatchObject({
      outcome: 'PENDING',
      checkoutId: harness.state.attempt.id,
    });
    expect(harness.state.attempt.status).toBe(CheckoutStatus.ReconciliationRequired);
    expect(harness.state.attempt.reconciliationAction).toBe(ReconciliationAction.CheckOrder);
    expect(harness.inventory.releaseStock).not.toHaveBeenCalled();

    await expect(harness.checkout.execute(command)).resolves.toMatchObject({
      outcome: 'COMPLETED',
      orderId: 501n,
    });
    expect(harness.orders.createOrder).toHaveBeenCalledTimes(1);
    expect(harness.inventory.commitStock).toHaveBeenCalledTimes(1);
    expect(harness.inventory.releaseStock).not.toHaveBeenCalled();
    expect(storedOrder).toEqual({ orderId: 501n, status: 'CREATED' });
    expect(harness.state.attempt.status).toBe(CheckoutStatus.Completed);
  });

  it('reissues idempotent order creation when lookup proves the uncertain request absent', async () => {
    const harness = recoveryHarness(checkOrderAttempt());
    const storedOrders = new Map<string, OrderCreateResult>();
    harness.orders.getOrderByCheckoutId.mockRejectedValue(
      new OrderCreationFailedError('Order not found.', 'NOT_FOUND'),
    );
    harness.orders.createOrder
      .mockRejectedValueOnce(new OrderCreationFailedError('Order timed out.', 'UNCERTAIN'))
      .mockImplementationOnce(async (_userId, _items, identity) => {
        const order = { orderId: 502n, status: 'CREATED' };
        storedOrders.set(identity.checkoutId, order);
        return order;
      });

    await expect(harness.checkout.execute(command)).resolves.toMatchObject({ outcome: 'PENDING' });
    expect(harness.inventory.releaseStock).not.toHaveBeenCalled();

    await expect(harness.checkout.execute(command)).resolves.toMatchObject({
      outcome: 'COMPLETED',
      orderId: 502n,
    });
    expect(harness.orders.createOrder).toHaveBeenCalledTimes(2);
    expect(storedOrders.size).toBe(1);
    expect(harness.inventory.releaseStock).not.toHaveBeenCalled();
  });

  it('compensates a definite order rejection and abandons the cart after release', async () => {
    const harness = recoveryHarness(checkOrderAttempt());
    harness.orders.getOrderByCheckoutId.mockRejectedValue(
      new OrderCreationFailedError('Order not found.', 'NOT_FOUND'),
    );
    harness.orders.createOrder.mockRejectedValue(
      new OrderCreationFailedError('Order request is invalid.', 'DEFINITE'),
    );

    await expect(harness.checkout.execute(command)).rejects.toBeInstanceOf(CheckoutTerminalError);

    expect(harness.attempts.markCompensating).toHaveBeenCalledOnce();
    expect(harness.inventory.releaseStock).toHaveBeenCalledOnce();
    expect(harness.state.attempt.status).toBe(CheckoutStatus.Failed);
    expect(harness.state.cart.status).toBe(CartStatus.Abandoned);
  });

  it('persists RELEASE_STOCK and its diagnostic when compensation fails', async () => {
    const harness = recoveryHarness(checkOrderAttempt());
    harness.orders.getOrderByCheckoutId.mockRejectedValue(
      new OrderCreationFailedError('Order not found.', 'NOT_FOUND'),
    );
    harness.orders.createOrder.mockRejectedValue(
      new OrderCreationFailedError('Order request is invalid.', 'DEFINITE'),
    );
    harness.inventory.releaseStock.mockRejectedValue(
      new InventoryReleaseFailedError('Inventory unavailable.', 'UNCERTAIN'),
    );

    await expect(harness.checkout.execute(command)).resolves.toMatchObject({ outcome: 'PENDING' });

    expect(harness.state.attempt.status).toBe(CheckoutStatus.ReconciliationRequired);
    expect(harness.state.attempt.reconciliationAction).toBe(ReconciliationAction.ReleaseStock);
    expect(harness.state.attempt.lastError).toContain('Inventory unavailable.');
    expect(harness.state.cart.status).toBe(CartStatus.Active);
  });

  it('retains the order after commit failure and completes on an idempotent commit retry', async () => {
    const harness = recoveryHarness(
      attempt({
        status: CheckoutStatus.OrderConfirmed,
        action: ReconciliationAction.CommitStock,
        orderId: 503n,
      }),
    );
    harness.inventory.commitStock
      .mockRejectedValueOnce(new InventoryCommitFailedError('Commit timed out.', 'UNCERTAIN'))
      .mockResolvedValueOnce();

    await expect(harness.checkout.execute(command)).resolves.toMatchObject({ outcome: 'PENDING' });
    expect(harness.state.attempt.orderId).toBe(503n);
    expect(harness.state.attempt.reconciliationAction).toBe(ReconciliationAction.CommitStock);
    expect(harness.inventory.releaseStock).not.toHaveBeenCalled();

    await expect(harness.checkout.execute(command)).resolves.toMatchObject({
      outcome: 'COMPLETED',
      orderId: 503n,
    });
    expect(harness.inventory.commitStock).toHaveBeenCalledTimes(2);
    expect(harness.orders.createOrder).not.toHaveBeenCalled();
    expect(harness.orders.getOrderByCheckoutId).not.toHaveBeenCalled();
    expect(harness.inventory.releaseStock).not.toHaveBeenCalled();
  });

  it('retries only local completion after the order and stock are committed', async () => {
    const harness = recoveryHarness(
      attempt({
        status: CheckoutStatus.StockCommitted,
        action: ReconciliationAction.CompleteCart,
        orderId: 504n,
      }),
    );
    harness.attempts.complete.mockRejectedValueOnce(new Error('Cart database unavailable.'));

    await expect(harness.checkout.execute(command)).resolves.toMatchObject({ outcome: 'PENDING' });
    expect(harness.state.attempt.orderId).toBe(504n);
    expect(harness.state.attempt.reconciliationAction).toBe(ReconciliationAction.CompleteCart);

    await expect(harness.checkout.execute(command)).resolves.toMatchObject({
      outcome: 'COMPLETED',
      orderId: 504n,
    });
    expect(harness.attempts.complete).toHaveBeenCalledTimes(2);
    expect(harness.inventory.reserveStock).not.toHaveBeenCalled();
    expect(harness.inventory.commitStock).not.toHaveBeenCalled();
    expect(harness.inventory.releaseStock).not.toHaveBeenCalled();
    expect(harness.orders.createOrder).not.toHaveBeenCalled();
    expect(harness.orders.getOrderByCheckoutId).not.toHaveBeenCalled();
  });
});

function recoveryHarness(initialAttempt: CheckoutAttemptEntity) {
  const state = {
    attempt: initialAttempt,
    cart: cart(CartStatus.Active),
  };
  const attempts: Mocked<CheckoutAttemptRepositoryPort> = {
    findById: vi.fn(async () => state.attempt),
    findByUserAndKey: vi.fn(async () => state.attempt),
    claimDue: vi.fn(),
    finishClaim: vi.fn(),
    markClaimFailed: vi.fn(),
    startOrLoad: vi.fn(async () => state.attempt),
    markStockReserved: vi.fn(async () => {
      state.attempt = replaceAttempt(state.attempt, {
        status: CheckoutStatus.StockReserved,
        action: ReconciliationAction.CheckOrder,
      });
      return state.attempt;
    }),
    markOrderConfirmed: vi.fn(async (_id, orderId) => {
      state.attempt = replaceAttempt(state.attempt, {
        status: CheckoutStatus.OrderConfirmed,
        action: ReconciliationAction.CommitStock,
        orderId,
        lastError: null,
      });
      return state.attempt;
    }),
    markStockCommitted: vi.fn(async () => {
      state.attempt = replaceAttempt(state.attempt, {
        status: CheckoutStatus.StockCommitted,
        action: ReconciliationAction.CompleteCart,
        lastError: null,
      });
      return state.attempt;
    }),
    markCompensating: vi.fn(async (_id, error) => {
      state.attempt = replaceAttempt(state.attempt, {
        status: CheckoutStatus.Compensating,
        action: ReconciliationAction.ReleaseStock,
        lastError: error,
      });
      return state.attempt;
    }),
    markReconciliationRequired: vi.fn(async (_id, action, error) => {
      state.attempt = replaceAttempt(state.attempt, {
        status: CheckoutStatus.ReconciliationRequired,
        action,
        lastError: error,
        retryCount: state.attempt.retryCount + 1,
      });
    }),
    complete: vi.fn(async () => {
      state.cart = cart(CartStatus.CheckedOut);
      state.attempt = replaceAttempt(state.attempt, {
        status: CheckoutStatus.Completed,
        action: null,
        lastError: null,
      });
      return state.cart;
    }),
    failAndAbandon: vi.fn(async (_id, error) => {
      state.cart = cart(CartStatus.Abandoned);
      state.attempt = replaceAttempt(state.attempt, {
        status: CheckoutStatus.Failed,
        action: null,
        lastError: error,
      });
    }),
  };
  const carts = {
    getOrCreateActiveCart: vi.fn(),
    findById: vi.fn(async () => state.cart),
    addOrIncrementItem: vi.fn(),
    updateItemQuantity: vi.fn(),
    deleteItem: vi.fn(),
    markCheckedOut: vi.fn(),
  } satisfies Mocked<CartRepositoryPort>;
  const inventory = {
    reserveStock: vi.fn(),
    commitStock: vi.fn(),
    releaseStock: vi.fn(),
  } satisfies Mocked<InventoryStockPort>;
  const orders = {
    createOrder: vi.fn(),
    getOrderByCheckoutId: vi.fn(),
  } satisfies Mocked<OrderCreatorPort>;
  const logger = {
    logInventoryReleaseFailure: vi.fn(),
  } satisfies Mocked<CheckoutFailureLoggerPort>;

  return {
    state,
    attempts,
    inventory,
    orders,
    checkout: new CheckoutCartUseCase(carts, attempts, inventory, orders, logger),
  };
}

function checkOrderAttempt(): CheckoutAttemptEntity {
  return attempt({
    status: CheckoutStatus.StockReserved,
    action: ReconciliationAction.CheckOrder,
  });
}

function attempt(overrides: {
  status: CheckoutStatus;
  action: ReconciliationAction | null;
  orderId?: bigint | null;
}): CheckoutAttemptEntity {
  return new CheckoutAttemptEntity({
    id: '018f47a1-7b72-4c7f-8c52-f06612de3377',
    userId: 10n,
    cartId: 20n,
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestHash: 'a'.repeat(64),
    requestHashVersion: 2,
    itemsSnapshot: [
      {
        productSkuId: '100',
        productName: 'Keyboard',
        skuCode: 'KB-100',
        imageUrl: null,
        price: '19.90',
        regularPrice: '19.90',
        priceSource: 'REGULAR',
        quantity: 1,
      },
    ],
    status: overrides.status,
    orderId: overrides.orderId,
    reconciliationAction: overrides.action,
    createdAt: new Date('2026-09-22T07:59:00.000Z'),
    updatedAt: new Date('2026-09-22T08:00:00.000Z'),
  });
}

function replaceAttempt(
  current: CheckoutAttemptEntity,
  overrides: {
    status?: CheckoutStatus;
    action?: ReconciliationAction | null;
    orderId?: bigint | null;
    lastError?: string | null;
    retryCount?: number;
  },
): CheckoutAttemptEntity {
  return new CheckoutAttemptEntity({
    ...current,
    status: overrides.status ?? current.status,
    reconciliationAction:
      overrides.action === undefined ? current.reconciliationAction : overrides.action,
    orderId: overrides.orderId === undefined ? current.orderId : overrides.orderId,
    lastError: overrides.lastError === undefined ? current.lastError : overrides.lastError,
    retryCount: overrides.retryCount ?? current.retryCount,
  });
}

function cart(status: CartStatus): CartEntity {
  return new CartEntity({ id: 20n, userId: 10n, status, items: [] });
}
