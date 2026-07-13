import { CartOperationError } from './cart-operation.error';

export class ProductSnapshotUnavailableError extends CartOperationError {
  constructor(message = 'Product service is unavailable.') {
    super(message);
    this.name = 'ProductSnapshotUnavailableError';
  }
}
