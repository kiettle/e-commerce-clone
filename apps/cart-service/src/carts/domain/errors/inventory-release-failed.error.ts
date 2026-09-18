import { CartOperationError } from './cart-operation.error';

export class InventoryReleaseFailedError extends CartOperationError {
  constructor(
    message: string,
    readonly outcome: 'DEFINITE' | 'UNCERTAIN' = 'UNCERTAIN',
  ) {
    super(message);
    this.name = 'InventoryReleaseFailedError';
  }
}
