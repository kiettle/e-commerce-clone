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
  requestHashVersion: number;
}

export class CreateOrderUseCase {
  constructor(private readonly orders: OrderRepositoryPort) {}

  async execute(command: CreateOrderCommand): Promise<OrderEntity> {
    assertValidUserId(command.userId);
    const checkoutIdentity = getCheckoutIdentity(command);

    if (checkoutIdentity) {
      const existingOrder = await this.orders.findByCheckoutId(checkoutIdentity.checkoutId);

      if (existingOrder) {
        return resolveExistingCheckoutOrder(existingOrder, checkoutIdentity, command.userId);
      }

      assertValidItems(command.items);
      assertValidCheckoutItems(command.items, checkoutIdentity.requestHashVersion);

      const expectedHash = hashCheckoutRequest(
        {
          userId: command.userId,
          cartId: checkoutIdentity.cartId,
          items: toCheckoutHashItems(command.items),
        },
        checkoutIdentity.requestHashVersion,
      );

      if (checkoutIdentity.requestHash !== expectedHash) {
        throw new InvalidOrderError('Order request hash does not match its checkout snapshot.');
      }
    } else {
      assertValidItems(command.items);
    }

    const items = command.items.map((item) => ({
      productName: item.productName.trim(),
      productSkuId: item.productSkuId,
      skuCode: item.skuCode?.trim() || item.productSkuId.toString(),
      imageUrl: item.imageUrl,
      price: toMoneyAmount(item.price),
      quantity: item.quantity,
      ...(checkoutIdentity?.requestHashVersion === 2
        ? {
            regularPrice: toMoneyAmount(item.regularPrice!),
            priceSource: item.priceSource!,
            flashSaleId: item.flashSaleId ?? null,
            flashSaleItemId: item.flashSaleItemId ?? null,
            saleEndsAt: item.saleEndsAt ? new Date(item.saleEndsAt) : null,
          }
        : {}),
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

    return this.orders.create(orderData);
  }
}

function getCheckoutIdentity(command: CreateOrderCommand): CheckoutIdentity | null {
  const hasAnyIdentity =
    command.checkoutId != null ||
    command.cartId != null ||
    command.requestHash != null ||
    command.requestHashVersion != null;

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
  const requestHashVersion = command.requestHashVersion ?? 1;
  if (requestHashVersion !== 1 && requestHashVersion !== 2) {
    throw new InvalidOrderError(
      `Unsupported checkout request hash version: ${requestHashVersion}.`,
    );
  }

  return {
    checkoutId: command.checkoutId,
    cartId: command.cartId,
    requestHash: command.requestHash,
    requestHashVersion,
  };
}

function resolveExistingCheckoutOrder(
  order: OrderEntity,
  identity: CheckoutIdentity,
  userId: bigint,
): OrderEntity {
  if (order.checkoutId == null || order.cartId == null || order.requestHash == null) {
    throw new InvalidOrderStateError(`Order ${order.id} has incomplete checkout identity.`);
  }

  if (
    order.requestHash !== identity.requestHash ||
    order.userId !== userId ||
    order.cartId !== identity.cartId ||
    (order.requestHashVersion ?? 1) !== identity.requestHashVersion
  ) {
    throw new CheckoutIdConflictError(identity.checkoutId);
  }

  return order;
}

function assertValidCheckoutItems(
  items: CreateOrderItemCommand[],
  requestHashVersion: number,
): void {
  if (requestHashVersion === 1) return;

  for (const item of items) {
    if (item.regularPrice == null || !Number.isFinite(item.regularPrice) || item.regularPrice < 0) {
      throw new InvalidOrderError('Version 2 order items require a valid regularPrice.');
    }

    if (item.priceSource !== 'REGULAR' && item.priceSource !== 'FLASH_SALE') {
      throw new InvalidOrderError('Version 2 order items require a valid priceSource.');
    }

    const hasSaleIds = item.flashSaleId != null && item.flashSaleItemId != null;
    const hasAnySaleId = item.flashSaleId != null || item.flashSaleItemId != null;
    if (item.priceSource === 'FLASH_SALE') {
      if (
        !hasSaleIds ||
        item.flashSaleId! <= 0n ||
        item.flashSaleItemId! <= 0n ||
        !item.saleEndsAt ||
        Number.isNaN(new Date(item.saleEndsAt).getTime())
      ) {
        throw new InvalidOrderError('Flash-sale order items require valid sale context.');
      }
    } else if (hasAnySaleId || item.saleEndsAt != null) {
      throw new InvalidOrderError('Regular order items cannot include flash-sale context.');
    }
  }
}

function toCheckoutHashItems(items: CreateOrderItemCommand[]) {
  return items.map((item) => {
    if (!item.skuCode) {
      throw new InvalidOrderError('Order item skuCode is required for checkout orders.');
    }

    return {
      ...item,
      skuCode: item.skuCode,
      priceSource: item.priceSource ?? undefined,
      regularPrice: item.regularPrice ?? undefined,
    };
  });
}

export function calculateTotalAmount(
  items: Array<Pick<CreateOrderItemCommand, 'price' | 'quantity'>>,
): number {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return toMoneyAmount(total);
}

function assertValidUserId(userId: bigint): void {
  if (userId <= 0n) {
    throw new InvalidOrderError('Order userId must be greater than zero.');
  }
}

function assertValidItems(items: CreateOrderItemCommand[]): void {
  if (items.length === 0) {
    throw new InvalidOrderError('Order items are required.');
  }

  for (const item of items) {
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
