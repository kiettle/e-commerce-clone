import { CartOperationError } from './cart-operation.error';

export class CheckoutConflictError extends CartOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutConflictError';
  }
}
