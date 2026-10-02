import { InventoryOperationError } from './inventory-operation.error';

export type FlashSaleReservationErrorCode =
  | 'FLASH_SALE_NOT_READY'
  | 'FLASH_SALE_NOT_ACTIVE'
  | 'FLASH_SALE_ENDED'
  | 'FLASH_SALE_SOLD_OUT'
  | 'FLASH_SALE_LIMIT_REACHED'
  | 'FLASH_SALE_QUANTITY_EXCEEDED';

const messages: Record<FlashSaleReservationErrorCode, string> = {
  FLASH_SALE_NOT_READY: 'Flash-sale inventory is not ready.',
  FLASH_SALE_NOT_ACTIVE: 'Flash sale has not started.',
  FLASH_SALE_ENDED: 'Flash sale has ended.',
  FLASH_SALE_SOLD_OUT: 'Flash-sale allocation is sold out.',
  FLASH_SALE_LIMIT_REACHED: 'Flash-sale purchase limit has been reached.',
  FLASH_SALE_QUANTITY_EXCEEDED: 'Flash-sale quantity exceeds the per-user limit.',
};

export class FlashSaleReservationError extends InventoryOperationError {
  constructor(code: FlashSaleReservationErrorCode) {
    super(messages[code], code);
    this.name = 'FlashSaleReservationError';
  }
}
