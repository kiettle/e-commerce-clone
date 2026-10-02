export class FlashSaleSkuNotFoundError extends Error {
  constructor(productSkuId: bigint) {
    super(`Product SKU ${productSkuId} was not found.`);
    this.name = 'FlashSaleSkuNotFoundError';
  }
}
