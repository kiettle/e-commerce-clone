import { CartItemEntity } from '../../domain/entities/cart-item.entity';
import { CartEntity } from '../../domain/entities/cart.entity';
import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';

export interface CartItemResponse {
  id: number;
  cartId: number;
  productId: number;
  productName: string;
  imageUrl?: string | null;
  productSkuId: number;
  skuCode: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface CartResponse {
  id: number;
  userId: number;
  status: string;
  totalAmount: number;
  items: CartItemResponse[];
}

export interface CheckoutCartResponse {
  orderId: number;
  cart: CartResponse;
}

export interface CheckoutPendingResponse {
  checkoutId: string;
  status: 'RECONCILIATION_REQUIRED';
}

export interface CheckoutStatusResponse {
  checkoutId: string;
  status: CheckoutStatus;
  orderId?: number;
  lastError?: string;
}

export function toCartResponse(cart: CartEntity): CartResponse {
  return {
    id: Number(cart.id),
    userId: Number(cart.userId),
    status: cart.status,
    totalAmount: cart.totalAmount,
    items: cart.items.map(toCartItemResponse),
  };
}

export function toCheckoutStatusResponse(
  attempt: CheckoutAttemptEntity,
): CheckoutStatusResponse {
  return {
    checkoutId: attempt.id,
    status: attempt.status,
    ...(attempt.orderId == null ? {} : { orderId: Number(attempt.orderId) }),
    ...(attempt.lastError == null
      ? {}
      : { lastError: publicCheckoutError(attempt.status) }),
  };
}

function publicCheckoutError(status: CheckoutStatus): string {
  if (status === CheckoutStatus.Failed) {
    return 'Checkout failed.';
  }

  return 'Checkout is awaiting recovery.';
}

function toCartItemResponse(item: CartItemEntity): CartItemResponse {
  return {
    id: Number(item.id),
    cartId: Number(item.cartId),
    productId: Number(item.productId),
    productName: item.productName,
    imageUrl: item.imageUrl,
    productSkuId: Number(item.productSkuId),
    skuCode: item.skuCode,
    price: item.price,
    quantity: item.quantity,
    subtotal: item.subtotal,
  };
}
