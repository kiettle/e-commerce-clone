import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { CartEntity } from '../../domain/entities/cart.entity';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { CartNotFoundError } from '../../domain/errors/cart-not-found.error';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { OrderCreationFailedError } from '../../domain/errors/order-creation-failed.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { CheckoutFailureLoggerPort } from '../ports/checkout-failure-logger.port';
import { InventoryStockPort } from '../ports/inventory-stock.port';
import { OrderCreatorPort } from '../ports/order-creator.port';
import { CheckoutCartUseCase } from './checkout-cart.use-case';

describe('CheckoutCartUseCase', () => {
  const command = {
    userId: 1n,
    cartId: 1n,
  };
  const cart = new CartEntity({
    id: 1n,
    userId: 1n,
    status: CartStatus.Active,
    items: [
      {
        productSkuId: 1n,
        productName: 'Product 1',
        skuCode: 'SKU1',
        imageUrl: 'http://example.com/product1.jpg',
        price: 100,
        quantity: 2,
        id: 1n,
        cartId: 1n,
        productId: 1n,
        subtotal: 200,
      },
    ],
  });
  const checkedOutCart = new CartEntity({
    ...cart,
    status: CartStatus.CheckedOut,
  });
  const stockItems = [{ productSkuId: 1n, quantity: 2 }];
  const orderItems = [
    {
      productSkuId: 1n,
      productName: 'Product 1',
      skuCode: 'SKU1',
      imageUrl: 'http://example.com/product1.jpg',
      price: 100,
      quantity: 2,
    },
  ];

  let carts: Mocked<CartRepositoryPort>;
  let inventory: Mocked<InventoryStockPort>;
  let orders: Mocked<OrderCreatorPort>;
  let checkoutFailureLogger: Mocked<CheckoutFailureLoggerPort>;
  let checkoutCartUseCase: CheckoutCartUseCase;

  beforeEach(() => {
    carts = {
      getOrCreateActiveCart: vi.fn(),
      findById: vi.fn(),
      addOrIncrementItem: vi.fn(),
      updateItemQuantity: vi.fn(),
      deleteItem: vi.fn(),
      markCheckedOut: vi.fn(),
    };
    inventory = {
      reserveStock: vi.fn(),
      releaseStock: vi.fn(),
    };
    orders = {
      createOrder: vi.fn(),
    };
    checkoutFailureLogger = {
      logInventoryReleaseFailure: vi.fn(),
    };
    checkoutCartUseCase = new CheckoutCartUseCase(carts, inventory, orders, checkoutFailureLogger);
  });

  it('reserves inventory, creates an order, and checks out the cart', async () => {
    const order = {
      orderId: 1n,
      status: 'CREATED',
    };

    carts.findById.mockResolvedValue(cart);
    inventory.reserveStock.mockResolvedValue();
    orders.createOrder.mockResolvedValue(order);
    carts.markCheckedOut.mockResolvedValue(checkedOutCart);

    const result = await checkoutCartUseCase.execute(command);

    expect(carts.findById).toHaveBeenCalledWith(command.cartId);
    expect(inventory.reserveStock).toHaveBeenCalledWith(cart.id, stockItems);
    expect(orders.createOrder).toHaveBeenCalledWith(command.userId, orderItems);
    expect(carts.markCheckedOut).toHaveBeenCalledWith(cart.id);
    expect(inventory.reserveStock).toHaveBeenCalledBefore(orders.createOrder);
    expect(orders.createOrder).toHaveBeenCalledBefore(carts.markCheckedOut);
    expect(inventory.releaseStock).not.toHaveBeenCalled();
    expect(checkoutFailureLogger.logInventoryReleaseFailure).not.toHaveBeenCalled();
    expect(result).toEqual({
      cart: checkedOutCart,
      orderId: order.orderId,
    });
  });

  it('rejects a missing cart without starting checkout', async () => {
    carts.findById.mockResolvedValue(null);

    await expect(checkoutCartUseCase.execute(command)).rejects.toBeInstanceOf(CartNotFoundError);
    expect(inventory.reserveStock).not.toHaveBeenCalled();
    expect(orders.createOrder).not.toHaveBeenCalled();
    expect(carts.markCheckedOut).not.toHaveBeenCalled();
  });

  it('rejects a cart belonging to another user without starting checkout', async () => {
    const anotherUsersCart = new CartEntity({
      ...cart,
      userId: 2n,
    });
    carts.findById.mockResolvedValue(anotherUsersCart);

    await expect(checkoutCartUseCase.execute(command)).rejects.toBeInstanceOf(CartNotFoundError);
    expect(inventory.reserveStock).not.toHaveBeenCalled();
    expect(orders.createOrder).not.toHaveBeenCalled();
    expect(carts.markCheckedOut).not.toHaveBeenCalled();
  });

  it('rejects a checked-out cart without starting checkout', async () => {
    carts.findById.mockResolvedValue(checkedOutCart);

    await expect(checkoutCartUseCase.execute(command)).rejects.toBeInstanceOf(
      InvalidCartOperationError,
    );
    expect(inventory.reserveStock).not.toHaveBeenCalled();
    expect(orders.createOrder).not.toHaveBeenCalled();
    expect(carts.markCheckedOut).not.toHaveBeenCalled();
  });

  it('rejects an empty cart without starting checkout', async () => {
    const emptyCart = new CartEntity({
      ...cart,
      items: [],
    });
    carts.findById.mockResolvedValue(emptyCart);

    await expect(checkoutCartUseCase.execute(command)).rejects.toBeInstanceOf(
      InvalidCartOperationError,
    );
    expect(inventory.reserveStock).not.toHaveBeenCalled();
    expect(orders.createOrder).not.toHaveBeenCalled();
    expect(carts.markCheckedOut).not.toHaveBeenCalled();
  });

  it('does not create an order when inventory reservation is rejected', async () => {
    const reservationError = new Error('Insufficient stock');
    carts.findById.mockResolvedValue(cart);
    inventory.reserveStock.mockRejectedValue(reservationError);

    await expect(checkoutCartUseCase.execute(command)).rejects.toBe(reservationError);
    expect(orders.createOrder).not.toHaveBeenCalled();
    expect(carts.markCheckedOut).not.toHaveBeenCalled();
    expect(inventory.releaseStock).not.toHaveBeenCalled();
  });

  it('releases reserved inventory when the order response is rejected', async () => {
    carts.findById.mockResolvedValue(cart);
    inventory.reserveStock.mockResolvedValue();
    orders.createOrder.mockResolvedValue({ orderId: 0n, status: 'REJECTED' });
    inventory.releaseStock.mockResolvedValue();

    await expect(checkoutCartUseCase.execute(command)).rejects.toBeInstanceOf(
      OrderCreationFailedError,
    );
    expect(inventory.releaseStock).toHaveBeenCalledWith(cart.id, stockItems);
    expect(carts.markCheckedOut).not.toHaveBeenCalled();
    expect(checkoutFailureLogger.logInventoryReleaseFailure).not.toHaveBeenCalled();
  });

  it('logs an inventory release failure without hiding the order error', async () => {
    const orderError = new OrderCreationFailedError('Order creation rejected');
    const releaseError = new Error('Inventory release failed');
    carts.findById.mockResolvedValue(cart);
    inventory.reserveStock.mockResolvedValue();
    orders.createOrder.mockRejectedValue(orderError);
    inventory.releaseStock.mockRejectedValue(releaseError);

    await expect(checkoutCartUseCase.execute(command)).rejects.toBe(orderError);
    expect(inventory.releaseStock).toHaveBeenCalledWith(cart.id, stockItems);
    expect(checkoutFailureLogger.logInventoryReleaseFailure).toHaveBeenCalledWith(
      cart.id,
      releaseError,
    );
  });

  it('documents the unsafe inventory release when cart completion fails after order creation', async () => {
    const completionError = new Error('Cart completion failed');
    carts.findById.mockResolvedValue(cart);
    inventory.reserveStock.mockResolvedValue();
    orders.createOrder.mockResolvedValue({ orderId: 1n, status: 'CREATED' });
    carts.markCheckedOut.mockRejectedValue(completionError);
    inventory.releaseStock.mockResolvedValue();

    await expect(checkoutCartUseCase.execute(command)).rejects.toBe(completionError);
    expect(orders.createOrder).toHaveBeenCalledWith(command.userId, orderItems);
    expect(carts.markCheckedOut).toHaveBeenCalledWith(cart.id);
    expect(inventory.releaseStock).toHaveBeenCalledWith(cart.id, stockItems);
  });
});
