export class FlashSaleOverlapError extends Error {
  readonly code = 'FLASH_SALE_OVERLAP';

  constructor() {
    super('FLASH_SALE_OVERLAP');
    this.name = 'FlashSaleOverlapError';
  }
}
