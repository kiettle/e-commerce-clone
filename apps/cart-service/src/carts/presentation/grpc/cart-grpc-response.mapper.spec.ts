import { describe, expect, it } from 'vitest';
import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CartItemEntity } from '../../domain/entities/cart-item.entity';
import { CartEntity } from '../../domain/entities/cart.entity';
import { CartItemPriceSource } from '../../domain/enums/cart-item-price-source.enum';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { ReconciliationAction } from '../../domain/enums/reconciliation-action.enum';
import { toCartResponse, toCheckoutStatusResponse } from './cart-grpc-response.mapper';

describe('toCartResponse', () => {
  it('exposes enough stored pricing context to explain a sale price', () => {
    const saleEndsAt = new Date('2026-10-01T10:00:00.000Z');
    const cart = new CartEntity({
      id: 20n,
      userId: 10n,
      status: CartStatus.Active,
      items: [
        new CartItemEntity({
          id: 30n,
          cartId: 20n,
          productId: 90n,
          productName: 'Keyboard',
          imageUrl: null,
          productSkuId: 100n,
          skuCode: 'KB-BLACK',
          price: 75,
          regularPrice: 100,
          priceSource: CartItemPriceSource.FlashSale,
          flashSaleId: 50n,
          flashSaleItemId: 501n,
          saleEndsAt,
          maxPerUserQuantity: 1,
          quantity: 1,
        }),
      ],
    });

    expect(toCartResponse(cart).items[0]).toMatchObject({
      price: 75,
      regular_price: 100,
      price_source: 'FLASH_SALE',
      flash_sale_id: '50',
      flash_sale_item_id: '501',
      sale_ends_at: '2026-10-01T10:00:00.000Z',
      max_quantity_per_user: 1,
    });
  });
});

describe('toCheckoutStatusResponse', () => {
  const checkoutId = '018f47a1-7b72-4c7f-8c52-f06612de3377';

  it('returns the public checkout fields and sanitizes the stored error', () => {
    const attempt = Object.assign(
      new CheckoutAttemptEntity({
        id: checkoutId,
        userId: 10n,
        cartId: 20n,
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
        requestHash: 'a'.repeat(64),
        itemsSnapshot: [],
        status: CheckoutStatus.ReconciliationRequired,
        orderId: 501n,
        lastError: 'connection reset at postgres://internal-host/cart_db',
        reconciliationAction: ReconciliationAction.CompleteCart,
        createdAt: new Date('2026-09-16T08:00:00.000Z'),
        updatedAt: new Date('2026-09-16T08:00:05.000Z'),
      }),
      { leaseOwner: 'worker-1' },
    );

    expect(toCheckoutStatusResponse(attempt)).toEqual({
      checkout_id: checkoutId,
      cart_id: '20',
      status: CheckoutStatus.ReconciliationRequired,
      order_id: '501',
      last_error: 'Checkout is awaiting recovery.',
      created_at: '2026-09-16T08:00:00.000Z',
      updated_at: '2026-09-16T08:00:05.000Z',
    });
    expect(JSON.stringify(toCheckoutStatusResponse(attempt))).not.toContain('internal-host');
    expect(toCheckoutStatusResponse(attempt)).not.toHaveProperty('leaseOwner');
    expect(toCheckoutStatusResponse(attempt)).not.toHaveProperty('requestHash');
  });

  it('returns null order and error fields when they are absent', () => {
    const attempt = new CheckoutAttemptEntity({
      id: checkoutId,
      userId: 10n,
      cartId: 20n,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      requestHash: 'a'.repeat(64),
      itemsSnapshot: [],
      status: CheckoutStatus.Started,
      reconciliationAction: ReconciliationAction.ReserveStock,
      createdAt: new Date('2026-09-16T08:00:00.000Z'),
      updatedAt: new Date('2026-09-16T08:00:00.000Z'),
    });

    expect(toCheckoutStatusResponse(attempt)).toEqual({
      checkout_id: checkoutId,
      cart_id: '20',
      status: CheckoutStatus.Started,
      order_id: undefined,
      last_error: undefined,
      created_at: '2026-09-16T08:00:00.000Z',
      updated_at: '2026-09-16T08:00:00.000Z',
    });
  });
});
