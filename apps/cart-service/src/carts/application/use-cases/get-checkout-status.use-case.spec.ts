import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { CheckoutNotFoundError } from '../../domain/errors/checkout-not-found.error';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { CheckoutAttemptRepositoryPort } from '../../domain/repositories/checkout-attempt.repository.port';
import { GetCheckoutStatusUseCase } from './get-checkout-status.use-case';

describe('GetCheckoutStatusUseCase', () => {
  const checkoutId = '018f47a1-7b72-4c7f-8c52-f06612de3377';
  let attempts: Mocked<CheckoutAttemptRepositoryPort>;
  let useCase: GetCheckoutStatusUseCase;

  beforeEach(() => {
    attempts = {
      findById: vi.fn(),
      findByUserAndKey: vi.fn(),
      claimDue: vi.fn(),
      finishClaim: vi.fn(),
      markClaimFailed: vi.fn(),
      startOrLoad: vi.fn(),
      markStockReserved: vi.fn(),
      markOrderConfirmed: vi.fn(),
      markStockCommitted: vi.fn(),
      markCompensating: vi.fn(),
      markReconciliationRequired: vi.fn(),
      complete: vi.fn(),
      failAndAbandon: vi.fn(),
    };
    useCase = new GetCheckoutStatusUseCase(attempts);
  });

  it('returns a checkout to its owner', async () => {
    const checkout = attempt();
    attempts.findById.mockResolvedValue(checkout);

    await expect(useCase.execute(10n, checkoutId)).resolves.toBe(checkout);
  });

  it('returns not found for a checkout owned by another user', async () => {
    attempts.findById.mockResolvedValue(attempt({ userId: 11n }));

    await expect(useCase.execute(10n, checkoutId)).rejects.toBeInstanceOf(CheckoutNotFoundError);
  });

  it('returns the same not-found error for an unknown checkout', async () => {
    attempts.findById.mockResolvedValue(null);

    await expect(useCase.execute(10n, checkoutId)).rejects.toEqual(
      new CheckoutNotFoundError(checkoutId),
    );
  });

  it('rejects a malformed checkout ID before querying persistence', async () => {
    await expect(useCase.execute(10n, 'not-a-uuid')).rejects.toBeInstanceOf(
      InvalidCartOperationError,
    );
    expect(attempts.findById).not.toHaveBeenCalled();
  });

  function attempt(
    overrides: Partial<ConstructorParameters<typeof CheckoutAttemptEntity>[0]> = {},
  ): CheckoutAttemptEntity {
    return new CheckoutAttemptEntity({
      id: checkoutId,
      userId: 10n,
      cartId: 20n,
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      requestHash: 'a'.repeat(64),
      itemsSnapshot: [],
      status: CheckoutStatus.Completed,
      orderId: 501n,
      reconciliationAction: null,
      createdAt: new Date('2026-09-16T08:00:00.000Z'),
      updatedAt: new Date('2026-09-16T08:00:05.000Z'),
      ...overrides,
    });
  }
});
