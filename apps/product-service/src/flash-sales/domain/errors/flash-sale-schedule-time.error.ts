export class FlashSaleScheduleTimeError extends Error {
  readonly code = 'FLASH_SALE_TIME_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'FlashSaleScheduleTimeError';
  }
}
