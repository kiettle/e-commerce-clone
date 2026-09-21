export class FlashSaleOverlapError extends Error {
  readonly code = 'FLASH_SALE_SKU_OVERLAP';

  constructor() {
    super('A SKU belongs to another overlapping scheduled sale.');
    this.name = 'FlashSaleOverlapError';
  }
}
