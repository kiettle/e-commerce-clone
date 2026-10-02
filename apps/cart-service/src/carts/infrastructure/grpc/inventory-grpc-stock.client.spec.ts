import { describe, expect, it } from 'vitest';
import { toGrpcRequest, toInventoryReservationError } from './inventory-grpc-stock.client';

describe('inventory gRPC request mapping', () => {
  const identity = {
    cartId: 20n,
    checkoutId: '550e8400-e29b-41d4-a716-446655440000',
    userId: 10n,
  };

  it('maps a regular stock operation without sale fields', () => {
    expect(
      toGrpcRequest({
        ...identity,
        items: [{ productSkuId: 100n, quantity: 2 }],
      }),
    ).toEqual({
      cart_id: '20',
      checkout_id: identity.checkoutId,
      user_id: '10',
      items: [{ product_sku_id: '100', quantity: 2 }],
    });
  });

  it('maps the complete server-owned sale context', () => {
    expect(
      toGrpcRequest({
        ...identity,
        items: [
          {
            productSkuId: 100n,
            quantity: 2,
            flashSaleId: 200n,
            flashSaleItemId: 300n,
          },
        ],
      }),
    ).toEqual({
      cart_id: '20',
      checkout_id: identity.checkoutId,
      user_id: '10',
      items: [
        {
          product_sku_id: '100',
          quantity: 2,
          flash_sale_id: '200',
          flash_sale_item_id: '300',
        },
      ],
    });
  });

  it.each([
    'FLASH_SALE_NOT_READY',
    'FLASH_SALE_NOT_ACTIVE',
    'FLASH_SALE_ENDED',
    'FLASH_SALE_SOLD_OUT',
    'FLASH_SALE_LIMIT_REACHED',
  ] as const)('preserves the definite inventory failure code %s', (code) => {
    expect(
      toInventoryReservationError({
        success: false,
        message: 'Sale reservation rejected.',
        error_code: code,
      }),
    ).toMatchObject({ outcome: 'DEFINITE', code });
  });
});
