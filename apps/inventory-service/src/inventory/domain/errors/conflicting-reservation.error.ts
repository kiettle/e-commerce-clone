import { InventoryOperationError } from './inventory-operation.error';

export class ConflictingReservationError extends InventoryOperationError {
  constructor(productSkuId: bigint) {
    super(`Conflicting stock reservation for SKU ${productSkuId.toString()}.`);
    this.name = 'ConflictingReservationError';
  }
}
