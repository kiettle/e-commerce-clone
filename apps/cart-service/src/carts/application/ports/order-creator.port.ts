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

export interface OrderCreatorPort {
  createOrder(userId: bigint, items: OrderCreateItem[]): Promise<OrderCreateResult>;
}
