import { FlashSaleReservationError } from '../errors/flash-sale-reservation.error';
import { InvalidStockOperationError } from '../errors/invalid-stock-operation.error';
import { StockOperation, StockOperationItem } from '../repositories/inventory.repository.port';

export type FlashSaleStockSnapshot = {
  flashSaleId: bigint;
  flashSaleItemId: bigint;
  productSkuId: bigint;
  startsAt: Date;
  endsAt: Date;
  stockLimit: number;
  reservedQuantity: number;
  soldQuantity: number;
  maxQuantityPerUser: number;
};

export type ActiveFlashSaleClaim = {
  cartId: bigint;
  flashSaleItemId: bigint | null;
};

export function validateFlashSaleReservation(
  operation: StockOperation,
  item: StockOperationItem & { flashSaleId: bigint; flashSaleItemId: bigint },
  saleStock: FlashSaleStockSnapshot | undefined,
  activeClaims: ActiveFlashSaleClaim[],
  now: Date,
): void {
  if (!saleStock) {
    throw new FlashSaleReservationError('FLASH_SALE_NOT_READY');
  }
  if (saleStock.flashSaleId !== item.flashSaleId || saleStock.productSkuId !== item.productSkuId) {
    throw new InvalidStockOperationError('Flash-sale item does not match the requested SKU.');
  }
  if (saleStock.startsAt > now) {
    throw new FlashSaleReservationError('FLASH_SALE_NOT_ACTIVE');
  }
  if (saleStock.endsAt <= now) {
    throw new FlashSaleReservationError('FLASH_SALE_ENDED');
  }
  if (item.quantity > saleStock.maxQuantityPerUser) {
    throw new FlashSaleReservationError('FLASH_SALE_QUANTITY_EXCEEDED');
  }
  if (
    activeClaims.some(
      (reservation) =>
        reservation.flashSaleItemId === item.flashSaleItemId &&
        reservation.cartId !== operation.cartId,
    )
  ) {
    throw new FlashSaleReservationError('FLASH_SALE_LIMIT_REACHED');
  }
  if (saleStock.reservedQuantity + saleStock.soldQuantity + item.quantity > saleStock.stockLimit) {
    throw new FlashSaleReservationError('FLASH_SALE_SOLD_OUT');
  }
}
