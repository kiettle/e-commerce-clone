export class FlashSaleScheduleTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlashSaleScheduleTimeError';
  }
}
