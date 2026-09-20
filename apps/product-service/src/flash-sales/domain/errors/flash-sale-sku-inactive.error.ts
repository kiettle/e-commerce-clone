export class FlashSaleSkuInactiveError extends Error {
  constructor(productSkuId: bigint) {
    super(`Product SKU ${productSkuId} is not active.`);
    this.name = 'FlashSaleSkuInactiveError';
  }
}
