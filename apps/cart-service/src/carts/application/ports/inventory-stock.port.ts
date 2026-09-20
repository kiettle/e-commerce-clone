export const INVENTORY_STOCK = Symbol('INVENTORY_STOCK');

export interface StockOperationItem {
  productSkuId: bigint;
  quantity: number;
}

export interface InventoryStockPort {
  reserveStock(cartId: bigint, items: StockOperationItem[]): Promise<void>;
  commitStock(cartId: bigint, items: StockOperationItem[]): Promise<void>;
  releaseStock(cartId: bigint, items: StockOperationItem[]): Promise<void>;
}
