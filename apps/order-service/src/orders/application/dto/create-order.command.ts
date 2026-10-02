export interface CreateOrderItemCommand {
  productName: string;
  productSkuId: bigint;
  skuCode?: string | null;
  imageUrl?: string | null;
  price: number;
  quantity: number;
  regularPrice?: number | null;
  priceSource?: string | null;
  flashSaleId?: bigint | null;
  flashSaleItemId?: bigint | null;
  saleEndsAt?: string | null;
}

export interface CreateOrderCommand {
  userId: bigint;
  checkoutId?: string | null;
  cartId?: bigint | null;
  requestHash?: string | null;
  requestHashVersion?: number | null;
  shippingAddress?: string | null;
  items: CreateOrderItemCommand[];
}
