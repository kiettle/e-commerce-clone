export class FlashSaleNotDraftError extends Error {
  constructor() {
    super('Only a draft flash sale can be changed.');
    this.name = 'FlashSaleNotDraftError';
  }
}
