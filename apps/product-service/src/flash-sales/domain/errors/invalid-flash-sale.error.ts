export class InvalidFlashSaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFlashSaleError';
  }
}
