import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { InvalidOrderError } from '../../domain/errors/invalid-order.error';
import { OrderRepositoryPort } from '../../domain/repositories/order.repository.port';
import { CreateOrderCommand, CreateOrderItemCommand } from '../dto/create-order.command';
import { hashCheckoutRequest } from '../services/checkout-request-hash';

interface CheckoutIdentity {
  checkoutId: string;
  cartId: bigint;
  requestHash: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/;

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
    }

    const items = command.items.map((item) => ({
      productName: item.productName.trim(),
      productSkuId: item.productSkuId,
      skuCode: item.skuCode?.trim() || item.productSkuId.toString(),
      imageUrl: item.imageUrl,
      price: toMoneyAmount(item.price),
      quantity: item.quantity,
    }));

    return this.orders.create({
      userId: command.userId,
      ...(checkoutIdentity ?? {}),
      totalAmount: calculateTotalAmount(items),
      status: OrderStatus.Created,
      paymentStatus: PaymentStatus.Pending,
      shippingAddress: command.shippingAddress,
      items,
    });
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

  if (!UUID_PATTERN.test(command.checkoutId)) {
    throw new InvalidOrderError('Order checkoutId must be a valid UUID.');
  }

  if (command.cartId <= 0n) {
    throw new InvalidOrderError('Order cartId must be greater than zero.');
  }

  if (!SHA_256_PATTERN.test(command.requestHash)) {
    throw new InvalidOrderError(
      'Order requestHash must be a lowercase SHA-256 hash.',
    );
  }

  return {
    checkoutId: command.checkoutId,
    cartId: command.cartId,
    requestHash: command.requestHash,
  };
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
