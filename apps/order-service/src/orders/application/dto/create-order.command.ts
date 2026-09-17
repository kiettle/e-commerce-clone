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
  checkoutId?: string | null;
  cartId?: bigint | null;
  requestHash?: string | null;
  shippingAddress?: string | null;
  items: CreateOrderItemCommand[];
}
