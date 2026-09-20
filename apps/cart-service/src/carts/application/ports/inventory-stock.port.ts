export const INVENTORY_STOCK = Symbol('INVENTORY_STOCK');

export interface StockOperationItem {
  productSkuId: bigint;
  quantity: number;
  flashSaleId?: bigint | null;
  flashSaleItemId?: bigint | null;
}

export interface StockOperationRequest {
  cartId: bigint;
  checkoutId: string;
  userId: bigint;
  items: StockOperationItem[];
}

export interface InventoryStockPort {
  reserveStock(request: StockOperationRequest): Promise<void>;
  commitStock(request: StockOperationRequest): Promise<void>;
  releaseStock(request: StockOperationRequest): Promise<void>;
}
