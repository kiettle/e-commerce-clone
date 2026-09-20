export class FlashSaleProductInactiveError extends Error {
  constructor(productId: bigint) {
    super(`Product ${productId} is not active.`);
    this.name = 'FlashSaleProductInactiveError';
  }
}
