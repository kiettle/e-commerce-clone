import { CartOperationError } from './cart-operation.error';

export class InventoryReservationFailedError extends CartOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryReservationFailedError';
  }
}
