import { describe, expect, it, vi } from 'vitest';
import { CheckoutConflictError } from '../../../domain/errors/checkout-conflict.error';
import { PrismaCheckoutAttemptRepository } from './checkout-attempt.prisma.repository';
import { PrismaService } from './prisma.service';

describe('PrismaCheckoutAttemptRepository startOrLoad', () => {
  const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

  it('returns the winning attempt after a concurrent unique constraint race', async () => {
    const winner = databaseAttempt();
    const prisma = {
      $transaction: vi.fn().mockRejectedValue({ code: 'P2002' }),
      checkoutAttempt: {
        findUnique: vi.fn().mockResolvedValue(winner),
      },
    };
    const repository = new PrismaCheckoutAttemptRepository(
      prisma as unknown as PrismaService,
    );

    const result = await repository.startOrLoad(10n, 20n, idempotencyKey);

    expect(result.id).toBe(winner.id);
    expect(result.cartId).toBe(20n);
    expect(result.idempotencyKey).toBe(idempotencyKey);
    expect(prisma.checkoutAttempt.findUnique).toHaveBeenCalledWith({
      where: { userId_idempotencyKey: { userId: 10n, idempotencyKey } },
    });
  });

  it('rejects the losing key when the cart uniqueness constraint wins', async () => {
    const prisma = {
      $transaction: vi.fn().mockRejectedValue({ code: 'P2002' }),
      checkoutAttempt: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(
            databaseAttempt({
              idempotencyKey: 'c73c9e6e-ce7f-4c68-8125-f76ffdb01bd5',
            }),
          ),
      },
    };
    const repository = new PrismaCheckoutAttemptRepository(
      prisma as unknown as PrismaService,
    );

    await expect(
      repository.startOrLoad(10n, 20n, idempotencyKey),
    ).rejects.toBeInstanceOf(CheckoutConflictError);
    expect(prisma.checkoutAttempt.findUnique).toHaveBeenLastCalledWith({
      where: { cartId: 20n },
    });
  });
});

function databaseAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: '018f47a1-7b72-4c7f-8c52-f06612de3377',
    userId: 10n,
    cartId: 20n,
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestHash: 'a'.repeat(64),
    itemsSnapshot: [
      {
        productSkuId: '100',
        productName: 'Example',
        skuCode: 'SKU-100',
        imageUrl: null,
        price: '19.90',
        quantity: 2,
      },
    ],
    status: 'STARTED',
    orderId: null,
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
    reconciliationAction: 'RESERVE_STOCK',
    leaseOwner: null,
    leaseUntil: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}
