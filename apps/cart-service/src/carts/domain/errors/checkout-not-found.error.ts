import { CartOperationError } from './cart-operation.error';

export class CheckoutNotFoundError extends CartOperationError {
  constructor(checkoutId: string) {
    super(`Checkout ${checkoutId} was not found.`);
    this.name = 'CheckoutNotFoundError';
  }
}
