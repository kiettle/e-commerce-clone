import { CartOperationError } from './cart-operation.error';

export class InvalidCartOperationError extends CartOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCartOperationError';
  }
}
