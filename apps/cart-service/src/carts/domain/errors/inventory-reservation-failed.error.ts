import { CartOperationError } from './cart-operation.error';

const inventoryReservationFailureCodes = [
  'FLASH_SALE_NOT_READY',
  'FLASH_SALE_NOT_ACTIVE',
  'FLASH_SALE_ENDED',
  'FLASH_SALE_SOLD_OUT',
  'FLASH_SALE_LIMIT_REACHED',
] as const;

export type InventoryReservationFailureCode =
  (typeof inventoryReservationFailureCodes)[number];

export function isInventoryReservationFailureCode(
  value: string | undefined,
): value is InventoryReservationFailureCode {
  return inventoryReservationFailureCodes.some((code) => code === value);
}

export class InventoryReservationFailedError extends CartOperationError {
  constructor(
    message: string,
    readonly outcome: 'DEFINITE' | 'UNCERTAIN' = 'DEFINITE',
    readonly code?: InventoryReservationFailureCode,
  ) {
    super(message);
    this.name = 'InventoryReservationFailedError';
  }
}
