export const FLASH_SALE_STOCK_REPOSITORY = Symbol('FLASH_SALE_STOCK_REPOSITORY');

export interface FlashSaleStockItem {
  flashSaleItemId: bigint;
  productSkuId: bigint;
  originalPrice: string;
  salePrice: string;
  quantityLimit: number;
}

export interface FlashSaleScheduledStockEvent {
  eventId: string;
  schemaVersion: number;
  payloadHash: string;
  flashSaleId: bigint;
  startsAt: Date;
  endsAt: Date;
  items: FlashSaleStockItem[];
}

export interface FlashSaleStockRepositoryPort {
  initializeFromFlashSaleScheduled(event: FlashSaleScheduledStockEvent): Promise<void>;
}
