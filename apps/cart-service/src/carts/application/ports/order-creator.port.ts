export const ORDER_CREATOR = Symbol('ORDER_CREATOR');

export interface OrderCreateItem {
  productSkuId: bigint;
  productName: string;
  skuCode: string;
  imageUrl?: string | null;
  price: number;
  quantity: number;
}

export interface OrderCreateResult {
  orderId: bigint;
  status: string;
}

export interface OrderCheckoutIdentity {
  checkoutId: string;
  cartId: bigint;
  requestHash: string;
}

export interface OrderCreatorPort {
  createOrder(
    userId: bigint,
    items: OrderCreateItem[],
    checkoutIdentity?: OrderCheckoutIdentity,
  ): Promise<OrderCreateResult>;
}
