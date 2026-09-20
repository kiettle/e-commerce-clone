import { describe, expect, it } from 'vitest';
import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { ReconciliationAction } from '../../domain/enums/reconciliation-action.enum';
import { toCheckoutStatusResponse } from './cart-response.mapper';

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
      checkoutId,
      cartId: 20,
      status: CheckoutStatus.ReconciliationRequired,
      orderId: 501,
      lastError: 'Checkout is awaiting recovery.',
      createdAt: '2026-09-16T08:00:00.000Z',
      updatedAt: '2026-09-16T08:00:05.000Z',
    });
    expect(JSON.stringify(toCheckoutStatusResponse(attempt))).not.toContain(
      'internal-host',
    );
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
      checkoutId,
      cartId: 20,
      status: CheckoutStatus.Started,
      orderId: null,
      lastError: null,
      createdAt: '2026-09-16T08:00:00.000Z',
      updatedAt: '2026-09-16T08:00:00.000Z',
    });
  });
});
