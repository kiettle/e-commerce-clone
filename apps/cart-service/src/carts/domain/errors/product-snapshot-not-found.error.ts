import { CartOperationError } from './cart-operation.error';

export class ProductSnapshotNotFoundError extends CartOperationError {
  constructor(productSkuId: bigint) {
    super(`Product SKU ${productSkuId.toString()} was not found.`);
    this.name = 'ProductSnapshotNotFoundError';
  }
}
