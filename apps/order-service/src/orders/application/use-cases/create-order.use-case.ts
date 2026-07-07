import { OrderEntity } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../domain/enums/order-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { InvalidOrderError } from '../../domain/errors/invalid-order.error';
import { OrderRepositoryPort } from '../../domain/repositories/order.repository.port';
import {
  CreateOrderCommand,
  CreateOrderItemCommand,
} from '../dto/create-order.command';

export class CreateOrderUseCase {
  constructor(private readonly orders: OrderRepositoryPort) {}

  async execute(command: CreateOrderCommand): Promise<OrderEntity> {
    assertValidCommand(command);

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
      totalAmount: calculateTotalAmount(items),
      status: OrderStatus.Created,
      paymentStatus: PaymentStatus.Pending,
      shippingAddress: command.shippingAddress,
      items,
    });
  }
}

export function calculateTotalAmount(
  items: Array<Pick<CreateOrderItemCommand, 'price' | 'quantity'>>,
): number {
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

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
