import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { describe, expect, it } from 'vitest';
import { CartItemPricingChangedError } from '../../domain/errors/cart-item-pricing-changed.error';
import { CheckoutTerminalError } from '../../domain/errors/checkout-terminal.error';
import { mapCartError } from './cart-grpc-error.mapper';

describe('mapCartError', () => {
  it('returns a conflict code when a stored pricing snapshot changed', () => {
    const mapped = mapCartError(new CartItemPricingChangedError());

    expect(mapped).toBeInstanceOf(RpcException);
    const result = (mapped as RpcException).getError() as { code: number; message: string };
    expect(result.code).toBe(status.FAILED_PRECONDITION);
    expect(JSON.parse(result.message)).toEqual({
      code: 'CART_ITEM_PRICING_CHANGED',
      message: 'The pricing context changed. Remove this item and add it again.',
    });
  });

  it('returns the sale reservation failure code', () => {
    const mapped = mapCartError(
      new CheckoutTerminalError('Flash sale has ended.', 'FLASH_SALE_ENDED'),
    );

    expect(mapped).toBeInstanceOf(RpcException);
    const result = (mapped as RpcException).getError() as { code: number; message: string };
    expect(result.code).toBe(status.FAILED_PRECONDITION);
    expect(JSON.parse(result.message)).toEqual({
      code: 'FLASH_SALE_ENDED',
      message: 'Flash sale has ended.',
    });
  });
});
