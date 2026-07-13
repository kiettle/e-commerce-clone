import { CartOperationError } from './cart-operation.error';

export class InventoryReleaseFailedError extends CartOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryReleaseFailedError';
  }
}
