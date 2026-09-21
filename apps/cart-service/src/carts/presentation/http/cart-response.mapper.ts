import { CartItemEntity } from '../../domain/entities/cart-item.entity';
import { CartEntity } from '../../domain/entities/cart.entity';
import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { CartItemPriceSource } from '../../domain/enums/cart-item-price-source.enum';

export interface CartItemResponse {
  id: number;
  cartId: number;
  productId: number;
  productName: string;
  imageUrl?: string | null;
  productSkuId: number;
  skuCode: string;
  price: number;
  regularPrice: number;
  priceSource: CartItemPriceSource;
  flashSaleId: number | null;
  flashSaleItemId: number | null;
  saleEndsAt: string | null;
  maxPerUserQuantity: number | null;
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
  checkoutId: string;
  status: 'COMPLETED';
  orderId: number;
  cart: CartResponse;
}

export interface CheckoutPendingResponse {
  checkoutId: string;
  status: 'RECONCILIATION_REQUIRED';
}

export interface CheckoutStatusResponse {
  checkoutId: string;
  cartId: number;
  status: CheckoutStatus;
  orderId: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
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

export function toCheckoutStatusResponse(attempt: CheckoutAttemptEntity): CheckoutStatusResponse {
  return {
    checkoutId: attempt.id,
    cartId: Number(attempt.cartId),
    status: attempt.status,
    orderId: attempt.orderId == null ? null : Number(attempt.orderId),
    lastError: attempt.lastError == null ? null : publicCheckoutError(attempt.status),
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
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
    regularPrice: item.regularPrice,
    priceSource: item.priceSource,
    flashSaleId: item.flashSaleId == null ? null : Number(item.flashSaleId),
    flashSaleItemId: item.flashSaleItemId == null ? null : Number(item.flashSaleItemId),
    saleEndsAt: item.saleEndsAt?.toISOString() ?? null,
    maxPerUserQuantity: item.maxPerUserQuantity,
    quantity: item.quantity,
    subtotal: item.subtotal,
  };
}
