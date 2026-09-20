export class FlashSaleNotFoundError extends Error {
  constructor(flashSaleId: bigint) {
    super(`Flash sale ${flashSaleId} was not found.`);
    this.name = 'FlashSaleNotFoundError';
  }
}
