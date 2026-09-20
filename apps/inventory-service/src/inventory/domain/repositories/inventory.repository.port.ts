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
}

export interface InventoryRepositoryPort {
  initializeFromProductCreated(event: ProductCreatedStockEvent): Promise<void>;
  reserveStock(cartId: bigint, items: StockOperationItem[]): Promise<void>;
  commitStock(cartId: bigint, items: StockOperationItem[]): Promise<void>;
  releaseStock(cartId: bigint, items: StockOperationItem[]): Promise<void>;
}
