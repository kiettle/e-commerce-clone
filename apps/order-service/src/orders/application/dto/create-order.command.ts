export interface CreateOrderItemCommand {
  productName: string;
  productSkuId: bigint;
  skuCode?: string | null;
  imageUrl?: string | null;
  price: number;
  quantity: number;
}

export interface CreateOrderCommand {
  userId: bigint;
  shippingAddress?: string | null;
  items: CreateOrderItemCommand[];
}
