import { InventoryOperationError } from './inventory-operation.error';

export class InsufficientStockError extends InventoryOperationError {
  constructor(productSkuId: bigint) {
    super(`Insufficient stock for SKU ${productSkuId.toString()}.`);
    this.name = 'InsufficientStockError';
  }
}
