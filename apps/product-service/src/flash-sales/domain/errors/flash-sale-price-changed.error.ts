export class FlashSalePriceChangedError extends Error {
  readonly code = 'FLASH_SALE_PRICE_CHANGED';
  readonly productSkuId: bigint;

  constructor(productSkuId: bigint) {
    super('FLASH_SALE_PRICE_CHANGED');
    this.name = 'FlashSalePriceChangedError';
    this.productSkuId = productSkuId;
  }
}
