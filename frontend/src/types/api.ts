export interface AuthenticatedUser {
  userId: number;
}

export interface Session {
  token: string;
  email: string;
  userId: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
}

export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'OUT_OF_STOCK' | 'DELETED';
export type ProductSkuStatus = 'AVAILABLE' | 'OUT_OF_STOCK' | 'DISABLED' | 'DISCONTINUED';

export interface ProductSku {
  id: number;
  productId: number;
  skuCode: string;
  price: number;
  status: ProductSkuStatus;
}

export interface Product {
  id: number;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  categoryId: number;
  sellerId: number;
  status: ProductStatus;
  skus: ProductSku[];
}

export interface CreateProductInput {
  name: string;
  description?: string;
  imageUrl?: string;
  categoryId: number;
  sellerId: number;
  status: ProductStatus;
  skus: Array<{
    skuCode: string;
    price: number;
    status: ProductSkuStatus;
    quantity: number;
  }>;
}

export interface CartItem {
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

export interface Cart {
  id: number;
  userId: number;
  status: 'ACTIVE' | 'CHECKED_OUT' | 'ABANDONED';
  totalAmount: number;
  items: CartItem[];
}

export interface CheckoutResult {
  checkoutId: string;
  status: 'COMPLETED';
  orderId: number;
  cart: Cart;
}

export interface HealthResponse {
  status: string;
  service?: string;
}

export interface PendingCheckoutResult {
  checkoutId: string;
  status: 'RECONCILIATION_REQUIRED';
}

export type CheckoutResponse = CheckoutResult | PendingCheckoutResult;
