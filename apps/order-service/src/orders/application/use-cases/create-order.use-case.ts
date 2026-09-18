import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { CheckoutIdConflictError } from '../../domain/errors/checkout-id-conflict.error';
import { InvalidOrderError } from '../../domain/errors/invalid-order.error';
import { InvalidOrderStateError } from '../../domain/errors/invalid-order-state.error';
import { OrderRepositoryPort } from '../../domain/repositories/order.repository.port';
import { CreateOrderCommand, CreateOrderItemCommand } from '../dto/create-order.command';
import {
  assertValidCheckoutId,
  assertValidRequestHash,
} from '../services/checkout-identity.validation';
import { hashCheckoutRequest } from '../services/checkout-request-hash';

interface CheckoutIdentity {
  checkoutId: string;
  cartId: bigint;
  requestHash: string;
}

export class CreateOrderUseCase {
  constructor(private readonly orders: OrderRepositoryPort) {}

  async execute(command: CreateOrderCommand): Promise<OrderEntity> {
    assertValidCommand(command);
    const checkoutIdentity = getCheckoutIdentity(command);

    if (checkoutIdentity) {
      const expectedHash = hashCheckoutRequest({
        userId: command.userId,
        cartId: checkoutIdentity.cartId,
        items: toCheckoutHashItems(command.items),
      });

      if (checkoutIdentity.requestHash !== expectedHash) {
        throw new InvalidOrderError(
          'Order request hash does not match its checkout snapshot.',
        );
      }

      const existingOrder = await this.orders.findByCheckoutId(
        checkoutIdentity.checkoutId,
      );

      if (existingOrder) {
        return resolveExistingCheckoutOrder(existingOrder, checkoutIdentity);
      }
    }

    const items = command.items.map((item) => ({
      productName: item.productName.trim(),
      productSkuId: item.productSkuId,
      skuCode: item.skuCode?.trim() || item.productSkuId.toString(),
      imageUrl: item.imageUrl,
      price: toMoneyAmount(item.price),
      quantity: item.quantity,
    }));

    const orderData = {
      userId: command.userId,
      ...(checkoutIdentity ?? {}),
      totalAmount: calculateTotalAmount(items),
      status: OrderStatus.Created,
      paymentStatus: PaymentStatus.Pending,
      shippingAddress: command.shippingAddress,
      items,
    };

    try {
      return await this.orders.create(orderData);
    } catch (error) {
      if (!checkoutIdentity) {
        throw error;
      }

      const concurrentOrder = await this.orders.findByCheckoutId(
        checkoutIdentity.checkoutId,
      );

      if (!concurrentOrder) {
        throw error;
      }

      return resolveExistingCheckoutOrder(concurrentOrder, checkoutIdentity);
    }
  }
}

function getCheckoutIdentity(
  command: CreateOrderCommand,
): CheckoutIdentity | null {
  const hasAnyIdentity =
    command.checkoutId != null ||
    command.cartId != null ||
    command.requestHash != null;

  if (!hasAnyIdentity) {
    return null;
  }

  if (!command.checkoutId || command.cartId == null || !command.requestHash) {
    throw new InvalidOrderError(
      'Order checkoutId, cartId, and requestHash must be provided together.',
    );
  }

  assertValidCheckoutId(command.checkoutId);

  if (command.cartId <= 0n) {
    throw new InvalidOrderError('Order cartId must be greater than zero.');
  }

  assertValidRequestHash(command.requestHash);

  return {
    checkoutId: command.checkoutId,
    cartId: command.cartId,
    requestHash: command.requestHash,
  };
}

function resolveExistingCheckoutOrder(
  order: OrderEntity,
  identity: CheckoutIdentity,
): OrderEntity {
  if (
    order.checkoutId == null ||
    order.cartId == null ||
    order.requestHash == null
  ) {
    throw new InvalidOrderStateError(
      `Order ${order.id} has incomplete checkout identity.`,
    );
  }

  if (order.requestHash !== identity.requestHash) {
    throw new CheckoutIdConflictError(identity.checkoutId);
  }

  if (order.status === OrderStatus.Cancelled) {
    throw new InvalidOrderStateError(
      `Order ${order.id} cannot be reused from status ${order.status}.`,
    );
  }

  return order;
}

function toCheckoutHashItems(items: CreateOrderItemCommand[]) {
  return items.map((item) => {
    if (!item.skuCode) {
      throw new InvalidOrderError(
        'Order item skuCode is required for checkout orders.',
      );
    }

    return {
      ...item,
      skuCode: item.skuCode,
    };
  });
}

export function calculateTotalAmount(
  items: Array<Pick<CreateOrderItemCommand, 'price' | 'quantity'>>,
): number {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return toMoneyAmount(total);
}

function assertValidCommand(command: CreateOrderCommand): void {
  if (command.userId <= 0n) {
    throw new InvalidOrderError('Order userId must be greater than zero.');
  }

  if (command.items.length === 0) {
    throw new InvalidOrderError('Order items are required.');
  }

  for (const item of command.items) {
    assertValidItem(item);
  }
}

function assertValidItem(item: CreateOrderItemCommand): void {
  if (item.productSkuId <= 0n) {
    throw new InvalidOrderError('Order item productSkuId must be greater than zero.');
  }

  if (item.productName.trim().length === 0) {
    throw new InvalidOrderError('Order item productName is required.');
  }

  if (!Number.isFinite(item.price) || item.price < 0) {
    throw new InvalidOrderError('Order item price must be a non-negative number.');
  }

  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new InvalidOrderError('Order item quantity must be greater than zero.');
  }
}

function toMoneyAmount(value: number): number {
  return Math.round(value * 100) / 100;
}
