import { CartOperationError } from './cart-operation.error';

export class InventoryCommitFailedError extends CartOperationError {
  constructor(
    message: string,
    readonly outcome: 'DEFINITE' | 'UNCERTAIN' = 'DEFINITE',
  ) {
    super(message);
    this.name = 'InventoryCommitFailedError';
  }
}
