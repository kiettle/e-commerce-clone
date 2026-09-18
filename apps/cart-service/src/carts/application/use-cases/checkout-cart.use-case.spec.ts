import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { CartEntity } from '../../domain/entities/cart.entity';
import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { ReconciliationAction } from '../../domain/enums/reconciliation-action.enum';
import { CheckoutConflictError } from '../../domain/errors/checkout-conflict.error';
import { CheckoutTerminalError } from '../../domain/errors/checkout-terminal.error';
import { InventoryReleaseFailedError } from '../../domain/errors/inventory-release-failed.error';
import { InventoryReservationFailedError } from '../../domain/errors/inventory-reservation-failed.error';
import { OrderCreationFailedError } from '../../domain/errors/order-creation-failed.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { CheckoutAttemptRepositoryPort } from '../../domain/repositories/checkout-attempt.repository.port';
import { CheckoutFailureLoggerPort } from '../ports/checkout-failure-logger.port';
import { InventoryStockPort } from '../ports/inventory-stock.port';
import { OrderCreatorPort } from '../ports/order-creator.port';
import { CheckoutCartUseCase } from './checkout-cart.use-case';

describe('CheckoutCartUseCase', () => {
  const checkoutId = '018f47a1-7b72-4c7f-8c52-f06612de3377';
  const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
  const command = { userId: 10n, cartId: 20n, idempotencyKey };
  const stockItems = [{ productSkuId: 100n, quantity: 2 }];
  const orderItems = [
    {
      productSkuId: 100n,
      productName: 'Example',
      skuCode: 'SKU-100',
      imageUrl: null,
      price: 19.9,
      quantity: 2,
    },
  ];
  const checkoutIdentity = {
    checkoutId,
    cartId: 20n,
    requestHash: 'a'.repeat(64),
  };
  const checkedOutCart = new CartEntity({
    id: 20n,
    userId: 10n,
    status: CartStatus.CheckedOut,
    items: [],
  });

  let carts: Mocked<CartRepositoryPort>;
  let attempts: Mocked<CheckoutAttemptRepositoryPort>;
  let inventory: Mocked<InventoryStockPort>;
  let orders: Mocked<OrderCreatorPort>;
  let logger: Mocked<CheckoutFailureLoggerPort>;
  let useCase: CheckoutCartUseCase;

  beforeEach(() => {
    carts = {
      getOrCreateActiveCart: vi.fn(),
      findById: vi.fn(),
      addOrIncrementItem: vi.fn(),
      updateItemQuantity: vi.fn(),
      deleteItem: vi.fn(),
      markCheckedOut: vi.fn(),
    };
    attempts = {
      findByUserAndKey: vi.fn(),
      startOrLoad: vi.fn(),
      markStockReserved: vi.fn(),
      markOrderConfirmed: vi.fn(),
      markCompensating: vi.fn(),
      markReconciliationRequired: vi.fn(),
      complete: vi.fn(),
      failAndAbandon: vi.fn(),
    };
    inventory = {
      reserveStock: vi.fn(),
      releaseStock: vi.fn(),
    };
    orders = {
      createOrder: vi.fn(),
      getOrderByCheckoutId: vi.fn(),
    };
    logger = { logInventoryReleaseFailure: vi.fn() };
    useCase = new CheckoutCartUseCase(
      carts,
      attempts,
      inventory,
      orders,
      logger,
    );
  });

  it('completes a new checkout and stores progress before each side effect', async () => {
    const started = attempt();
    const stockReserved = attempt({
      status: CheckoutStatus.StockReserved,
      reconciliationAction: ReconciliationAction.CheckOrder,
    });
    const orderConfirmed = attempt({
      status: CheckoutStatus.OrderConfirmed,
      orderId: 501n,
      reconciliationAction: ReconciliationAction.CompleteCart,
    });
    attempts.findByUserAndKey.mockResolvedValue(null);
    attempts.startOrLoad.mockResolvedValue(started);
    attempts.markStockReserved.mockResolvedValue(stockReserved);
    orders.createOrder.mockResolvedValue({ orderId: 501n, status: 'CREATED' });
    attempts.markOrderConfirmed.mockResolvedValue(orderConfirmed);
    attempts.complete.mockResolvedValue(checkedOutCart);

    await expect(useCase.execute(command)).resolves.toEqual({
      outcome: 'COMPLETED',
      cart: checkedOutCart,
      orderId: 501n,
    });

    expect(attempts.startOrLoad).toHaveBeenCalledWith(10n, 20n, idempotencyKey);
    expect(inventory.reserveStock).toHaveBeenCalledWith(20n, stockItems);
    expect(attempts.markStockReserved).toHaveBeenCalledWith(checkoutId);
    expect(orders.getOrderByCheckoutId).not.toHaveBeenCalled();
    expect(orders.createOrder).toHaveBeenCalledWith(
      10n,
      orderItems,
      checkoutIdentity,
    );
    expect(attempts.markOrderConfirmed).toHaveBeenCalledWith(checkoutId, 501n);
    expect(attempts.complete).toHaveBeenCalledWith(checkoutId, 501n);
    expect(attempts.startOrLoad).toHaveBeenCalledBefore(inventory.reserveStock);
    expect(attempts.markStockReserved).toHaveBeenCalledBefore(
      orders.createOrder,
    );
    expect(attempts.markOrderConfirmed).toHaveBeenCalledBefore(
      attempts.complete,
    );
  });

  it('returns the original result for a completed retry without calling dependencies', async () => {
    attempts.findByUserAndKey.mockResolvedValue(
      attempt({
        status: CheckoutStatus.Completed,
        orderId: 501n,
        reconciliationAction: null,
      }),
    );
    carts.findById.mockResolvedValue(checkedOutCart);

    await expect(useCase.execute(command)).resolves.toEqual({
      outcome: 'COMPLETED',
      cart: checkedOutCart,
      orderId: 501n,
    });

    expect(attempts.startOrLoad).not.toHaveBeenCalled();
    expect(inventory.reserveStock).not.toHaveBeenCalled();
    expect(orders.createOrder).not.toHaveBeenCalled();
    expect(attempts.complete).not.toHaveBeenCalled();
  });

  it('rejects the same key when it belongs to another cart', async () => {
    attempts.findByUserAndKey.mockResolvedValue(attempt({ cartId: 21n }));

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      CheckoutConflictError,
    );
    expect(attempts.startOrLoad).not.toHaveBeenCalled();
    expect(inventory.reserveStock).not.toHaveBeenCalled();
  });

  it('rejects another key for a cart that is already frozen', async () => {
    attempts.findByUserAndKey.mockResolvedValue(null);
    attempts.startOrLoad.mockRejectedValue(
      new CheckoutConflictError(
        'This cart already has a checkout attempt with another key.',
      ),
    );

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      CheckoutConflictError,
    );
    expect(inventory.reserveStock).not.toHaveBeenCalled();
  });

  it('does not create an order after a definite inventory rejection', async () => {
    attempts.findByUserAndKey.mockResolvedValue(attempt());
    inventory.reserveStock.mockRejectedValue(
      new InventoryReservationFailedError('Insufficient stock.', 'DEFINITE'),
    );

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      CheckoutTerminalError,
    );
    expect(attempts.failAndAbandon).toHaveBeenCalledWith(
      checkoutId,
      'Insufficient stock.',
    );
    expect(orders.createOrder).not.toHaveBeenCalled();
    expect(inventory.releaseStock).not.toHaveBeenCalled();
  });

  it('stores RESERVE_STOCK when the inventory outcome is uncertain', async () => {
    attempts.findByUserAndKey.mockResolvedValue(attempt());
    inventory.reserveStock.mockRejectedValue(
      new InventoryReservationFailedError('Inventory unavailable.', 'UNCERTAIN'),
    );

    await expect(useCase.execute(command)).resolves.toEqual({
      outcome: 'PENDING',
      checkoutId,
      status: 'RECONCILIATION_REQUIRED',
    });
    expect(attempts.markReconciliationRequired).toHaveBeenCalledWith(
      checkoutId,
      ReconciliationAction.ReserveStock,
      'Inventory unavailable.',
    );
    expect(orders.createOrder).not.toHaveBeenCalled();
  });

  it('does not release stock when the order outcome is uncertain', async () => {
    attempts.findByUserAndKey.mockResolvedValue(checkOrderAttempt());
    orders.getOrderByCheckoutId.mockRejectedValue(
      new OrderCreationFailedError('Order not found.', 'NOT_FOUND'),
    );
    orders.createOrder.mockRejectedValue(
      new OrderCreationFailedError('Order timed out.', 'UNCERTAIN'),
    );

    await expect(useCase.execute(command)).resolves.toMatchObject({
      outcome: 'PENDING',
      checkoutId,
    });
    expect(attempts.markReconciliationRequired).toHaveBeenCalledWith(
      checkoutId,
      ReconciliationAction.CheckOrder,
      'Order timed out.',
    );
    expect(inventory.releaseStock).not.toHaveBeenCalled();
  });

  it('resumes after a lost response by finding and completing the existing order', async () => {
    attempts.findByUserAndKey.mockResolvedValue(checkOrderAttempt());
    orders.getOrderByCheckoutId.mockResolvedValue({
      orderId: 501n,
      status: 'CREATED',
    });
    const confirmed = attempt({
      status: CheckoutStatus.OrderConfirmed,
      orderId: 501n,
      reconciliationAction: ReconciliationAction.CompleteCart,
    });
    attempts.markOrderConfirmed.mockResolvedValue(confirmed);
    attempts.complete.mockResolvedValue(checkedOutCart);

    await expect(useCase.execute(command)).resolves.toMatchObject({
      outcome: 'COMPLETED',
      orderId: 501n,
    });
    expect(orders.createOrder).not.toHaveBeenCalled();
    expect(inventory.releaseStock).not.toHaveBeenCalled();
  });

  it('creates the order on retry when lookup definitely returns not found', async () => {
    attempts.findByUserAndKey.mockResolvedValue(checkOrderAttempt());
    orders.getOrderByCheckoutId.mockRejectedValue(
      new OrderCreationFailedError('Order not found.', 'NOT_FOUND'),
    );
    orders.createOrder.mockResolvedValue({ orderId: 502n, status: 'CREATED' });
    const confirmed = attempt({
      status: CheckoutStatus.OrderConfirmed,
      orderId: 502n,
      reconciliationAction: ReconciliationAction.CompleteCart,
    });
    attempts.markOrderConfirmed.mockResolvedValue(confirmed);
    attempts.complete.mockResolvedValue(checkedOutCart);

    await expect(useCase.execute(command)).resolves.toMatchObject({
      outcome: 'COMPLETED',
      orderId: 502n,
    });
    expect(orders.createOrder).toHaveBeenCalledTimes(1);
  });

  it('stores COMPLETE_CART when local completion fails and keeps stock reserved', async () => {
    attempts.findByUserAndKey.mockResolvedValue(
      attempt({
        status: CheckoutStatus.OrderConfirmed,
        orderId: 501n,
        reconciliationAction: ReconciliationAction.CompleteCart,
      }),
    );
    attempts.complete.mockRejectedValue(new Error('Database unavailable.'));

    await expect(useCase.execute(command)).resolves.toMatchObject({
      outcome: 'PENDING',
      checkoutId,
    });
    expect(attempts.markReconciliationRequired).toHaveBeenCalledWith(
      checkoutId,
      ReconciliationAction.CompleteCart,
      'Database unavailable.',
    );
    expect(inventory.releaseStock).not.toHaveBeenCalled();
  });

  it('releases stock exactly once after a definite order rejection', async () => {
    attempts.findByUserAndKey.mockResolvedValue(checkOrderAttempt());
    orders.getOrderByCheckoutId.mockRejectedValue(
      new OrderCreationFailedError('Order not found.', 'NOT_FOUND'),
    );
    orders.createOrder.mockRejectedValue(
      new OrderCreationFailedError('Request hash is invalid.', 'DEFINITE'),
    );
    attempts.markCompensating.mockResolvedValue(
      attempt({
        status: CheckoutStatus.Compensating,
        reconciliationAction: ReconciliationAction.ReleaseStock,
        lastError: 'Request hash is invalid.',
      }),
    );

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      CheckoutTerminalError,
    );
    expect(attempts.markCompensating).toHaveBeenCalledWith(
      checkoutId,
      'Request hash is invalid.',
    );
    expect(inventory.releaseStock).toHaveBeenCalledTimes(1);
    expect(inventory.releaseStock).toHaveBeenCalledWith(20n, stockItems);
    expect(attempts.failAndAbandon).toHaveBeenCalledWith(
      checkoutId,
      'Request hash is invalid.',
    );
  });

  it('does not release stock when another retry has already completed', async () => {
    attempts.findByUserAndKey.mockResolvedValue(checkOrderAttempt());
    orders.getOrderByCheckoutId.mockRejectedValue(
      new OrderCreationFailedError('Order not found.', 'NOT_FOUND'),
    );
    orders.createOrder.mockRejectedValue(
      new OrderCreationFailedError('Request rejected.', 'DEFINITE'),
    );
    attempts.markCompensating.mockResolvedValue(
      attempt({
        status: CheckoutStatus.Completed,
        orderId: 501n,
        reconciliationAction: null,
      }),
    );
    carts.findById.mockResolvedValue(checkedOutCart);

    await expect(useCase.execute(command)).resolves.toMatchObject({
      outcome: 'COMPLETED',
      orderId: 501n,
    });
    expect(inventory.releaseStock).not.toHaveBeenCalled();
  });

  it('stores RELEASE_STOCK when compensation fails', async () => {
    attempts.findByUserAndKey.mockResolvedValue(
      attempt({
        status: CheckoutStatus.Compensating,
        reconciliationAction: ReconciliationAction.ReleaseStock,
        lastError: 'Order rejected.',
      }),
    );
    inventory.releaseStock.mockRejectedValue(
      new InventoryReleaseFailedError('Inventory unavailable.'),
    );

    await expect(useCase.execute(command)).resolves.toMatchObject({
      outcome: 'PENDING',
      checkoutId,
    });
    expect(attempts.markReconciliationRequired).toHaveBeenCalledWith(
      checkoutId,
      ReconciliationAction.ReleaseStock,
      'Order rejected. Release failed: Inventory unavailable.',
    );
    expect(logger.logInventoryReleaseFailure).toHaveBeenCalledWith(
      20n,
      expect.any(InventoryReleaseFailedError),
    );
    expect(attempts.failAndAbandon).not.toHaveBeenCalled();
  });

  function checkOrderAttempt(): CheckoutAttemptEntity {
    return attempt({
      status: CheckoutStatus.StockReserved,
      reconciliationAction: ReconciliationAction.CheckOrder,
    });
  }

  function attempt(
    overrides: Partial<ConstructorParameters<typeof CheckoutAttemptEntity>[0]> = {},
  ): CheckoutAttemptEntity {
    return new CheckoutAttemptEntity({
      id: checkoutId,
      userId: 10n,
      cartId: 20n,
      idempotencyKey,
      requestHash: 'a'.repeat(64),
      itemsSnapshot: [
        {
          productSkuId: '100',
          productName: 'Example',
          skuCode: 'SKU-100',
          imageUrl: null,
          price: '19.90',
          quantity: 2,
        },
      ],
      status: CheckoutStatus.Started,
      reconciliationAction: ReconciliationAction.ReserveStock,
      ...overrides,
    });
  }
});
