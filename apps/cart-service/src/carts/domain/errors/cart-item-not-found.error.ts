import { CartOperationError } from './cart-operation.error';

export class CartItemNotFoundError extends CartOperationError {
  constructor(cartItemId: bigint) {
    super(`Cart item ${cartItemId.toString()} was not found.`);
    this.name = 'CartItemNotFoundError';
  }
}
