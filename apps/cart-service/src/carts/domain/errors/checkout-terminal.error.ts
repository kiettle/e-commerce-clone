import { CartOperationError } from './cart-operation.error';

export class CheckoutTerminalError extends CartOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutTerminalError';
  }
}
