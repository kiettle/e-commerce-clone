import { CartItemEntity } from '../../domain/entities/cart-item.entity';
import { CartEntity } from '../../domain/entities/cart.entity';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { OrderCreationFailedError } from '../../domain/errors/order-creation-failed.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { CheckoutFailureLoggerPort } from '../ports/checkout-failure-logger.port';
import { InventoryStockPort } from '../ports/inventory-stock.port';
import { OrderCreatorPort } from '../ports/order-creator.port';
import { CheckoutCartUseCase } from './checkout-cart.use-case';

describe('CheckoutCartUseCase', () => {
  let carts: jest.Mocked<CartRepositoryPort>;
  let inventory: jest.Mocked<InventoryStockPort>;
  let orders: jest.Mocked<OrderCreatorPort>;
  let checkoutFailureLogger: jest.Mocked<CheckoutFailureLoggerPort>;
  let useCase: CheckoutCartUseCase;

  beforeEach(() => {
    carts = {
      getOrCreateActiveCart: jest.fn(),
      findById: jest.fn().mockResolvedValue(cartWithItems()),
      addOrIncrementItem: jest.fn(),
      updateItemQuantity: jest.fn(),
      deleteItem: jest.fn(),
      markCheckedOut: jest.fn().mockResolvedValue(checkedOutCart()),
    };
    inventory = {
      reserveStock: jest.fn(),
      releaseStock: jest.fn(),
    };
    orders = {
      createOrder: jest.fn().mockResolvedValue({
        orderId: 55n,
        status: 'CREATED',
      }),
    };
    checkoutFailureLogger = {
      logInventoryReleaseFailure: jest.fn(),
    };
    useCase = new CheckoutCartUseCase(
      carts,
      inventory,
      orders,
      checkoutFailureLogger,
    );
  });

  it('reserves stock, creates order, and marks cart checked out', async () => {
    const result = await useCase.execute({
      userId: 7n,
      cartId: 1n,
    });

    expect(result.orderId).toBe(55n);
    expect(inventory.reserveStock).toHaveBeenCalledWith(1n, [
      { productSkuId: 10n, quantity: 2 },
    ]);
    expect(orders.createOrder).toHaveBeenCalledWith(7n, [
      {
        productSkuId: 10n,
        productName: 'Orange Shirt',
        skuCode: 'SHIRT-ORANGE-M',
        imageUrl: 'https://example.test/orange-shirt.png',
        price: 12.5,
        quantity: 2,
      },
    ]);
    expect(carts.markCheckedOut).toHaveBeenCalledWith(1n);
    expect(result.cart.status).toBe(CartStatus.CheckedOut);
  });

  it('fails when cart is empty', async () => {
    carts.findById.mockResolvedValueOnce(
      new CartEntity({
        id: 1n,
        userId: 7n,
        status: CartStatus.Active,
      }),
    );

    await expect(
      useCase.execute({
        userId: 7n,
        cartId: 1n,
      }),
    ).rejects.toBeInstanceOf(InvalidCartOperationError);
    expect(inventory.reserveStock).not.toHaveBeenCalled();
  });

  it('releases stock when order creation fails', async () => {
    orders.createOrder.mockRejectedValueOnce(
      new OrderCreationFailedError('Order service request failed.'),
    );

    await expect(
      useCase.execute({
        userId: 7n,
        cartId: 1n,
      }),
    ).rejects.toBeInstanceOf(OrderCreationFailedError);
    expect(inventory.releaseStock).toHaveBeenCalledWith(1n, [
      { productSkuId: 10n, quantity: 2 },
    ]);
  });

  it('logs release failure and keeps original order failure', async () => {
    const orderError = new OrderCreationFailedError('Order failed.');
    const releaseError = new Error('Release failed.');
    orders.createOrder.mockRejectedValueOnce(orderError);
    inventory.releaseStock.mockRejectedValueOnce(releaseError);

    await expect(
      useCase.execute({
        userId: 7n,
        cartId: 1n,
      }),
    ).rejects.toBe(orderError);
    expect(checkoutFailureLogger.logInventoryReleaseFailure).toHaveBeenCalledWith(
      1n,
      releaseError,
    );
  });
});

function cartWithItems(): CartEntity {
  return new CartEntity({
    id: 1n,
    userId: 7n,
    status: CartStatus.Active,
    items: [
      new CartItemEntity({
        id: 9n,
        cartId: 1n,
        productId: 20n,
        productName: 'Orange Shirt',
        imageUrl: 'https://example.test/orange-shirt.png',
        productSkuId: 10n,
        skuCode: 'SHIRT-ORANGE-M',
        price: 12.5,
        quantity: 2,
      }),
    ],
  });
}

function checkedOutCart(): CartEntity {
  return new CartEntity({
    id: 1n,
    userId: 7n,
    status: CartStatus.CheckedOut,
    items: cartWithItems().items,
  });
}
