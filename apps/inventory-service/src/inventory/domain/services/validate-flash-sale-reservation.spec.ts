import { describe, expect, it } from 'vitest';
import { FlashSaleReservationError } from '../errors/flash-sale-reservation.error';
import { InvalidStockOperationError } from '../errors/invalid-stock-operation.error';
import { StockOperation } from '../repositories/inventory.repository.port';
import {
  FlashSaleStockSnapshot,
  validateFlashSaleReservation,
} from './validate-flash-sale-reservation';

describe('validateFlashSaleReservation', () => {
  const now = new Date('2026-09-21T08:00:00.000Z');
  const item = {
    productSkuId: 101n,
    quantity: 1,
    flashSaleId: 201n,
    flashSaleItemId: 301n,
  };
  const operation: StockOperation = {
    cartId: 401n,
    checkoutId: '550e8400-e29b-41d4-a716-446655440000',
    userId: 501n,
    items: [item],
  };
  const saleStock: FlashSaleStockSnapshot = {
    flashSaleId: 201n,
    flashSaleItemId: 301n,
    productSkuId: 101n,
    startsAt: new Date('2026-09-21T07:00:00.000Z'),
    endsAt: new Date('2026-09-21T09:00:00.000Z'),
    stockLimit: 5,
    reservedQuantity: 1,
    soldQuantity: 1,
    maxQuantityPerUser: 1,
  };

  it('rejects a sale that inventory has not initialized', () => {
    expect(() => validateFlashSaleReservation(operation, item, undefined, [], now)).toThrowError(
      expect.objectContaining({ code: 'FLASH_SALE_NOT_READY' }),
    );
  });

  it('rejects sale context that does not match the requested SKU', () => {
    expect(() =>
      validateFlashSaleReservation(operation, item, { ...saleStock, productSkuId: 999n }, [], now),
    ).toThrow(InvalidStockOperationError);
  });

  it('rejects a sale before its start time', () => {
    expectFlashSaleError(
      { ...saleStock, startsAt: new Date(now.getTime() + 1) },
      [],
      'FLASH_SALE_NOT_ACTIVE',
    );
  });

  it('rejects a sale exactly at its end time', () => {
    expectFlashSaleError({ ...saleStock, endsAt: now }, [], 'FLASH_SALE_ENDED');
  });

  it('rejects a quantity above the per-user limit', () => {
    expectFlashSaleError(
      { ...saleStock, maxQuantityPerUser: 0 },
      [],
      'FLASH_SALE_QUANTITY_EXCEEDED',
    );
  });

  it('rejects a second active claim by the same user on another cart', () => {
    expectFlashSaleError(
      saleStock,
      [{ cartId: 999n, flashSaleItemId: item.flashSaleItemId }],
      'FLASH_SALE_LIMIT_REACHED',
    );
  });

  it('rejects a sale whose allocation is sold out', () => {
    expectFlashSaleError(
      { ...saleStock, reservedQuantity: 3, soldQuantity: 2 },
      [],
      'FLASH_SALE_SOLD_OUT',
    );
  });

  it('allows an active sale with stock and no claim from another cart', () => {
    expect(() =>
      validateFlashSaleReservation(
        operation,
        item,
        saleStock,
        [{ cartId: operation.cartId, flashSaleItemId: item.flashSaleItemId }],
        now,
      ),
    ).not.toThrow();
  });

  function expectFlashSaleError(
    stock: FlashSaleStockSnapshot,
    activeClaims: Array<{ cartId: bigint; flashSaleItemId: bigint | null }>,
    code: FlashSaleReservationError['code'],
  ): void {
    expect(() =>
      validateFlashSaleReservation(operation, item, stock, activeClaims, now),
    ).toThrowError(expect.objectContaining({ code }));
  }
});
