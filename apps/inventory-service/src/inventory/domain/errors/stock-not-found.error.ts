import { InventoryOperationError } from './inventory-operation.error';

export class StockNotFoundError extends InventoryOperationError {
  constructor(productSkuId: bigint) {
    super(`Inventory stock not found for SKU ${productSkuId.toString()}.`);
    this.name = 'StockNotFoundError';
  }
}
