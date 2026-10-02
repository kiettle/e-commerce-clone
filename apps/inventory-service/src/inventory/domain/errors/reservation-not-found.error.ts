import { InventoryOperationError } from './inventory-operation.error';

export class ReservationNotFoundError extends InventoryOperationError {
  constructor(productSkuId: bigint) {
    super(`Stock reservation not found for SKU ${productSkuId.toString()}.`);
    this.name = 'ReservationNotFoundError';
  }
}
