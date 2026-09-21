import { describe, expect, it } from 'vitest';
import { FlashSaleReservationError } from '../../domain/errors/flash-sale-reservation.error';
import { toCommand } from './inventory.grpc.controller';
import { InventoryGrpcController } from './inventory.grpc.controller';

describe('inventory gRPC command mapping', () => {
  it('maps operation identity and complete sale context without number conversion', () => {
    expect(
      toCommand({
        cart_id: '9007199254740993',
        checkout_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '9007199254740995',
        items: [
          {
            product_sku_id: '9007199254740997',
            quantity: 2,
            flash_sale_id: '9007199254740999',
            flash_sale_item_id: '9007199254741001',
          },
        ],
      }),
    ).toEqual({
      cartId: 9007199254740993n,
      checkoutId: '550e8400-e29b-41d4-a716-446655440000',
      userId: 9007199254740995n,
      items: [
        {
          productSkuId: 9007199254740997n,
          quantity: 2,
          flashSaleId: 9007199254740999n,
          flashSaleItemId: 9007199254741001n,
        },
      ],
    });
  });

  it('maps an absent sale context to regular inventory', () => {
    expect(
      toCommand({
        cart_id: '20',
        checkout_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '10',
        items: [{ product_sku_id: '100', quantity: 1 }],
      }).items,
    ).toEqual([
      {
        productSkuId: 100n,
        quantity: 1,
        flashSaleId: null,
        flashSaleItemId: null,
      },
    ]);
  });

  it('returns a structured sale reservation error', async () => {
    const reserve = {
      execute: async () => {
        throw new FlashSaleReservationError('FLASH_SALE_SOLD_OUT');
      },
    };
    const noOp = { execute: async () => undefined };
    const controller = new InventoryGrpcController(reserve as never, noOp as never, noOp as never);

    await expect(
      controller.reserveStock({
        cart_id: '20',
        checkout_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: '10',
        items: [{ product_sku_id: '100', quantity: 1 }],
      }),
    ).resolves.toEqual({
      success: false,
      message: 'Flash-sale allocation is sold out.',
      error_code: 'FLASH_SALE_SOLD_OUT',
    });
  });
});
