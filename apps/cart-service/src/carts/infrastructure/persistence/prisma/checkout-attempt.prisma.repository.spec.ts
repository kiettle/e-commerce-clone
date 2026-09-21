import { describe, expect, it, vi } from 'vitest';
import { CheckoutStatus } from '../../../domain/enums/checkout-status.enum';
import { ReconciliationAction } from '../../../domain/enums/reconciliation-action.enum';
import { CheckoutConflictError } from '../../../domain/errors/checkout-conflict.error';
import { InvalidCartOperationError } from '../../../domain/errors/invalid-cart-operation.error';
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
    const repository = new PrismaCheckoutAttemptRepository(prisma as unknown as PrismaService);

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
    const repository = new PrismaCheckoutAttemptRepository(prisma as unknown as PrismaService);

    await expect(repository.startOrLoad(10n, 20n, idempotencyKey)).rejects.toBeInstanceOf(
      CheckoutConflictError,
    );
    expect(prisma.checkoutAttempt.findUnique).toHaveBeenLastCalledWith({
      where: { cartId: 20n },
    });
  });

  it('rejects an expired stored sale before creating a checkout attempt', async () => {
    const transaction = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ now: new Date('2026-10-01T10:00:00.000Z') }]),
      cart: {
        findUnique: vi.fn().mockResolvedValue({
          id: 20n,
          userId: 10n,
          status: 'ACTIVE',
          items: [
            {
              productSkuId: 100n,
              priceSource: 'FLASH_SALE',
              saleEndsAt: new Date('2026-10-01T10:00:00.000Z'),
            },
          ],
        }),
      },
      checkoutAttempt: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (work: (client: typeof transaction) => unknown) =>
        work(transaction),
      ),
    };
    const repository = new PrismaCheckoutAttemptRepository(prisma as unknown as PrismaService);

    await expect(repository.startOrLoad(10n, 20n, idempotencyKey)).rejects.toBeInstanceOf(
      InvalidCartOperationError,
    );
    expect(transaction.checkoutAttempt.create).not.toHaveBeenCalled();
  });
});

describe('PrismaCheckoutAttemptRepository successful transitions', () => {
  it('moves an order-confirmed attempt to COMMIT_STOCK', async () => {
    const prisma = transitionPrisma(
      databaseAttempt({
        status: CheckoutStatus.OrderConfirmed,
        orderId: 501n,
        reconciliationAction: ReconciliationAction.CommitStock,
      }),
    );
    const repository = new PrismaCheckoutAttemptRepository(prisma as unknown as PrismaService);

    await repository.markOrderConfirmed('018f47a1-7b72-4c7f-8c52-f06612de3377', 501n);

    expect(prisma.checkoutAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        id: '018f47a1-7b72-4c7f-8c52-f06612de3377',
        reconciliationAction: ReconciliationAction.CheckOrder,
        status: { notIn: [CheckoutStatus.Completed, CheckoutStatus.Failed] },
      },
      data: expect.objectContaining({
        status: CheckoutStatus.OrderConfirmed,
        orderId: 501n,
        reconciliationAction: ReconciliationAction.CommitStock,
      }),
    });
  });

  it('moves a committed attempt to COMPLETE_CART', async () => {
    const prisma = transitionPrisma(
      databaseAttempt({
        status: CheckoutStatus.StockCommitted,
        orderId: 501n,
        reconciliationAction: ReconciliationAction.CompleteCart,
      }),
    );
    const repository = new PrismaCheckoutAttemptRepository(prisma as unknown as PrismaService);

    await repository.markStockCommitted('018f47a1-7b72-4c7f-8c52-f06612de3377');

    expect(prisma.checkoutAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        id: '018f47a1-7b72-4c7f-8c52-f06612de3377',
        reconciliationAction: ReconciliationAction.CommitStock,
        status: { notIn: [CheckoutStatus.Completed, CheckoutStatus.Failed] },
      },
      data: expect.objectContaining({
        status: CheckoutStatus.StockCommitted,
        reconciliationAction: ReconciliationAction.CompleteCart,
      }),
    });
  });
});

function transitionPrisma(attempt: ReturnType<typeof databaseAttempt>) {
  return {
    checkoutAttempt: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(attempt),
    },
  };
}

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
