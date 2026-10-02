export class FlashSaleNotDraftError extends Error {
  readonly code = 'FLASH_SALE_NOT_EDITABLE';
  constructor() {
    super('Only a draft flash sale can be changed.');
    this.name = 'FlashSaleNotDraftError';
  }
}
