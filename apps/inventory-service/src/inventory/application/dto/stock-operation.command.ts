export interface StockOperationCommandItem {
  productSkuId: bigint;
  quantity: number;
  flashSaleId?: bigint | null;
  flashSaleItemId?: bigint | null;
}

export interface StockOperationCommand {
  cartId: bigint;
  checkoutId: string;
  userId: bigint;
  items: StockOperationCommandItem[];
}
