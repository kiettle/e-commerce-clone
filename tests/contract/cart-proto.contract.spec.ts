import { join } from 'node:path';
import { loadSync } from 'protobufjs';
import { describe, it, expect } from 'vitest';
const root = loadSync(join(process.cwd(), 'libs/proto/cart.proto'));
function roundTrip(name: string, value: Record<string, unknown>) {
  const type = root.lookupType(`cart.${name}`);
  return type.toObject(type.decode(type.encode(type.fromObject(value)).finish()), {
    longs: String,
    defaults: true,
    oneofs: true,
  });
}
describe('cart protobuf contract', () => {
  it('exposes the six cart operations', () => {
    expect(Object.keys(root.lookupService('cart.CartService').methods)).toEqual([
      'GetActiveCart',
      'AddCartItem',
      'UpdateCartItem',
      'DeleteCartItem',
      'CheckoutCart',
      'GetCheckoutStatus',
    ]);
  });
  it('preserves large IDs and distinguishes missing quantity from zero', () => {
    expect(
      roundTrip('UpdateCartItemRequest', {
        userId: '9223372036854775807',
        cartItemId: '9007199254740993',
      }),
    ).toEqual({ userId: '9223372036854775807', cartItemId: '9007199254740993' });
    expect(
      roundTrip('UpdateCartItemRequest', { userId: '10', cartItemId: '30', quantity: 0 }),
    ).toMatchObject({ quantity: 0 });
  });
  it('keeps pending and completed outcomes distinct', () => {
    const pending = roundTrip('CheckoutCartResponse', { pending: { checkoutId: 'id' } });
    expect(pending).toMatchObject({ outcome: 'pending', pending: { checkoutId: 'id' } });
    expect(pending).not.toHaveProperty('completed');
    const completed = roundTrip('CheckoutCartResponse', {
      completed: {
        checkoutId: 'id',
        orderId: '9007199254740993',
        cart: { id: '20', userId: '10', status: 'CHECKED_OUT' },
      },
    });
    expect(completed).toMatchObject({
      outcome: 'completed',
      completed: { orderId: '9007199254740993', cart: { items: [], totalAmount: 0 } },
    });
  });
  it('does not replace absent optional prices and error fields with zero or empty strings', () => {
    const status = roundTrip('CheckoutStatusResponse', {
      checkoutId: 'id',
      cartId: '20',
      status: 'STARTED',
    });
    expect(status).not.toHaveProperty('orderId');
    expect(status).not.toHaveProperty('lastError');
    const item = roundTrip('CartItemResponse', { id: '30', quantity: 1 });
    expect(item).not.toHaveProperty('flashSaleId');
    expect(item).not.toHaveProperty('saleEndsAt');
  });
});
