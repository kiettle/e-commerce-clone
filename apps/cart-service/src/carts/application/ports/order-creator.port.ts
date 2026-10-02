export const ORDER_CREATOR = Symbol('ORDER_CREATOR');

export interface OrderCreateItem {
  productSkuId: bigint;
  productName: string;
  skuCode: string;
  imageUrl?: string | null;
  price: number;
  quantity: number;
  regularPrice?: number;
  priceSource?: string;
  flashSaleId?: bigint | null;
  flashSaleItemId?: bigint | null;
  saleEndsAt?: string | null;
}

export interface OrderCreateResult {
  orderId: bigint;
  status: string;
}

export interface OrderCheckoutIdentity {
  checkoutId: string;
  cartId: bigint;
  requestHash: string;
  requestHashVersion: number;
}

export interface OrderCreatorPort {
  createOrder(
    userId: bigint,
    items: OrderCreateItem[],
    checkoutIdentity?: OrderCheckoutIdentity,
  ): Promise<OrderCreateResult>;
  getOrderByCheckoutId(checkoutId: string): Promise<OrderCreateResult>;
}
