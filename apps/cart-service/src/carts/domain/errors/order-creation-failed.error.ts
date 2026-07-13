import { CartOperationError } from './cart-operation.error';

export class OrderCreationFailedError extends CartOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'OrderCreationFailedError';
  }
}
