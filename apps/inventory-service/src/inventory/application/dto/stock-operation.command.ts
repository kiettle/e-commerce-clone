export interface StockOperationCommandItem {
  productSkuId: bigint;
  quantity: number;
}

export interface StockOperationCommand {
  cartId: bigint;
  items: StockOperationCommandItem[];
}
