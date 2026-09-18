import { CartItemEntity } from '../../domain/entities/cart-item.entity';
import { CartEntity } from '../../domain/entities/cart.entity';

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

export function toCartResponse(cart: CartEntity): CartResponse {
  return {
    id: Number(cart.id),
    userId: Number(cart.userId),
    status: cart.status,
    totalAmount: cart.totalAmount,
    items: cart.items.map(toCartItemResponse),
  };
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
