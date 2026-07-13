import { CartStatus } from '../../domain/enums/cart-status.enum';
import { CartNotFoundError } from '../../domain/errors/cart-not-found.error';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { OrderCreationFailedError } from '../../domain/errors/order-creation-failed.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { CheckoutCartCommand } from '../dto/checkout-cart.command';
import { CheckoutCartResult } from '../dto/checkout-cart.result';
import { CheckoutFailureLoggerPort } from '../ports/checkout-failure-logger.port';
import { InventoryStockPort, StockOperationItem } from '../ports/inventory-stock.port';
import { OrderCreateItem, OrderCreatorPort } from '../ports/order-creator.port';
import { assertPositiveId } from './get-active-cart.use-case';

const CREATED_ORDER_STATUS = 'CREATED';

export class CheckoutCartUseCase {
  constructor(
    private readonly carts: CartRepositoryPort,
    private readonly inventory: InventoryStockPort,
    private readonly orders: OrderCreatorPort,
    private readonly checkoutFailureLogger: CheckoutFailureLoggerPort,
  ) {}

  async execute(command: CheckoutCartCommand): Promise<CheckoutCartResult> {
    assertPositiveId(command.userId, 'Cart userId must be greater than zero.');
    assertPositiveId(command.cartId, 'Cart ID must be greater than zero.');

    const cart = await this.carts.findById(command.cartId);

    if (!cart || cart.userId !== command.userId) {
      throw new CartNotFoundError(command.cartId);
    }

    if (cart.status !== CartStatus.Active) {
      throw new InvalidCartOperationError('Only active carts can be checked out.');
    }

    if (cart.items.length === 0) {
      throw new InvalidCartOperationError('Cart must contain at least one item.');
    }

    const stockItems = cart.items.map<StockOperationItem>((item) => ({
      productSkuId: item.productSkuId,
      quantity: item.quantity,
    }));
    const orderItems = cart.items.map<OrderCreateItem>((item) => ({
      productSkuId: item.productSkuId,
      productName: item.productName,
      skuCode: item.skuCode,
      imageUrl: item.imageUrl,
      price: item.price,
      quantity: item.quantity,
    }));

    await this.inventory.reserveStock(cart.id, stockItems);

    try {
      const order = await this.orders.createOrder(command.userId, orderItems);

      if (order.status !== CREATED_ORDER_STATUS || order.orderId <= 0n) {
        throw new OrderCreationFailedError(
          `Order service returned status ${order.status}.`,
        );
      }

      return {
        cart: await this.carts.markCheckedOut(cart.id),
        orderId: order.orderId,
      };
    } catch (error) {
      await this.releaseReservedStock(cart.id, stockItems);
      throw error;
    }
  }

  private async releaseReservedStock(
    cartId: bigint,
    items: StockOperationItem[],
  ): Promise<void> {
    try {
      await this.inventory.releaseStock(cartId, items);
    } catch (releaseError) {
      this.checkoutFailureLogger.logInventoryReleaseFailure(
        cartId,
        releaseError,
      );
    }
  }
}
