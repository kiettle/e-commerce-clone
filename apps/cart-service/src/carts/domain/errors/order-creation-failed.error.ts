import { CartOperationError } from './cart-operation.error';

export class OrderCreationFailedError extends CartOperationError {
  constructor(
    message: string,
    readonly outcome: 'DEFINITE' | 'UNCERTAIN' | 'NOT_FOUND' = 'DEFINITE',
  ) {
    super(message);
    this.name = 'OrderCreationFailedError';
  }
}
