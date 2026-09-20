import { describe, expect, it } from 'vitest';
import { toGrpcRequest } from './inventory-grpc-stock.client';

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
});
