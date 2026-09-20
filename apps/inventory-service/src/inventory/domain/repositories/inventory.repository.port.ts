export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');

export interface ProductCreatedStockSku {
  productSkuId: bigint;
  skuCode: string;
  status: string;
  quantity: number;
}

export interface ProductCreatedStockEvent {
  eventId: string;
  schemaVersion: number;
  payloadHash: string;
  productId: bigint;
  name: string;
  skus: ProductCreatedStockSku[];
}

export interface StockOperationItem {
  productSkuId: bigint;
  quantity: number;
  flashSaleId?: bigint | null;
  flashSaleItemId?: bigint | null;
}

export interface StockOperation {
  cartId: bigint;
  checkoutId: string;
  userId: bigint;
  items: StockOperationItem[];
}

export interface InventoryRepositoryPort {
  initializeFromProductCreated(event: ProductCreatedStockEvent): Promise<void>;
  reserveStock(operation: StockOperation): Promise<void>;
  commitStock(operation: StockOperation): Promise<void>;
  releaseStock(operation: StockOperation): Promise<void>;
}
