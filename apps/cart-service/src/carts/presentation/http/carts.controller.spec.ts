import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CartItemPricingChangedError } from '../../domain/errors/cart-item-pricing-changed.error';
import { mapCartError } from './carts.controller';

describe('mapCartError', () => {
  it('returns a conflict code when a stored pricing snapshot changed', () => {
    const mapped = mapCartError(new CartItemPricingChangedError());

    expect(mapped).toBeInstanceOf(ConflictException);
    expect((mapped as ConflictException).getResponse()).toEqual({
      code: 'CART_ITEM_PRICING_CHANGED',
      message: 'The pricing context changed. Remove this item and add it again.',
    });
  });
});
