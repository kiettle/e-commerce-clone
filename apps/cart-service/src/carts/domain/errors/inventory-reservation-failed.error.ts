import { CartOperationError } from './cart-operation.error';

export class InventoryReservationFailedError extends CartOperationError {
  constructor(
    message: string,
    readonly outcome: 'DEFINITE' | 'UNCERTAIN' = 'DEFINITE',
  ) {
    super(message);
    this.name = 'InventoryReservationFailedError';
  }
}
