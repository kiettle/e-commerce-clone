import { CartOperationError } from './cart-operation.error';

export class CartNotFoundError extends CartOperationError {
  constructor(cartId: bigint) {
    super(`Cart ${cartId.toString()} was not found.`);
    this.name = 'CartNotFoundError';
  }
}
