export class ProductNotFoundError extends Error {
  constructor(productId: bigint) {
    super(`Product ${productId.toString()} was not found.`);
  }
}
