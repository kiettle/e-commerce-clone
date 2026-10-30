import type { CallOptions, Metadata } from '@grpc/grpc-js';
import type { Observable } from 'rxjs';

export interface UserRequest {
  user_id: string;
}
export interface AddCartItemRequest extends UserRequest {
  product_sku_id: string;
  quantity?: number;
}
export interface CartItemRequest extends UserRequest {
  cart_item_id: string;
}
export interface UpdateCartItemRequest extends CartItemRequest {
  quantity?: number;
}
export interface CheckoutCartRequest extends UserRequest {
  cart_id: string;
  idempotency_key: string;
}
export interface CheckoutStatusRequest extends UserRequest {
  checkout_id: string;
}
export interface CartItemResponse {
  id: string;
  cart_id: string;
  product_id: string;
  product_name: string;
  image_url?: string;
  product_sku_id: string;
  sku_code: string;
  price: number;
  regular_price: number;
  price_source: string;
  flash_sale_id?: string;
  flash_sale_item_id?: string;
  sale_ends_at?: string;
  max_quantity_per_user?: number;
  quantity: number;
  subtotal: number;
}
export interface CartResponse {
  id: string;
  user_id: string;
  status: string;
  total_amount: number;
  items: CartItemResponse[];
}
export interface CheckoutCartResponse {
  completed?: { checkout_id: string; order_id: string; cart: CartResponse };
  pending?: { checkout_id: string };
}
export interface CheckoutStatusResponse {
  checkout_id: string;
  cart_id: string;
  status: string;
  order_id?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}
type Unary<Request, Response> = (
  request: Request,
  metadata?: Metadata,
  options?: CallOptions,
) => Observable<Response>;
export interface CartGrpcService {
  getActiveCart: Unary<UserRequest, CartResponse>;
  addCartItem: Unary<AddCartItemRequest, CartResponse>;
  updateCartItem: Unary<UpdateCartItemRequest, CartResponse>;
  deleteCartItem: Unary<CartItemRequest, CartResponse>;
  checkoutCart: Unary<CheckoutCartRequest, CheckoutCartResponse>;
  getCheckoutStatus: Unary<CheckoutStatusRequest, CheckoutStatusResponse>;
}
