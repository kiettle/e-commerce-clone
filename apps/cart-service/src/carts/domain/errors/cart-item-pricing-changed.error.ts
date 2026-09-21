import { CartOperationError } from './cart-operation.error';

export class CartItemPricingChangedError extends CartOperationError {
  readonly code = 'CART_ITEM_PRICING_CHANGED';

  constructor() {
    super('The pricing context changed. Remove this item and add it again.');
    this.name = 'CartItemPricingChangedError';
  }
}
