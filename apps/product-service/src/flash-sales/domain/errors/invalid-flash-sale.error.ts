export class InvalidFlashSaleError extends Error {
  constructor(
    message: string,
    readonly code: string = 'FLASH_SALE_NOT_SCHEDULABLE',
  ) {
    super(message);
    this.name = 'InvalidFlashSaleError';
  }
}
