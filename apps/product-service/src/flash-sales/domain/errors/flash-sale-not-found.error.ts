export class FlashSaleNotFoundError extends Error {
  readonly code = 'FLASH_SALE_NOT_FOUND';
  constructor(flashSaleId: bigint) {
    super(`Flash sale ${flashSaleId} was not found.`);
    this.name = 'FlashSaleNotFoundError';
  }
}
