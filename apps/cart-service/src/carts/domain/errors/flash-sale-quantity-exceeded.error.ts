import { CartOperationError } from './cart-operation.error';

export class FlashSaleQuantityExceededError extends CartOperationError {
  readonly code = 'FLASH_SALE_QUANTITY_EXCEEDED';

  constructor() {
    super('Flash-sale quantity exceeds the per-user limit.');
    this.name = 'FlashSaleQuantityExceededError';
  }
}
