import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { CheckoutCartUseCase } from '../../application/use-cases/checkout-cart.use-case';
import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { ReconciliationAction } from '../../domain/enums/reconciliation-action.enum';
import { CheckoutAttemptRepositoryPort } from '../../domain/repositories/checkout-attempt.repository.port';
import { CheckoutReconciliationWorker } from './checkout-reconciliation.worker';

describe('CheckoutReconciliationWorker', () => {
  let attempts: Mocked<CheckoutAttemptRepositoryPort>;
  let resumeAttempt: ReturnType<typeof vi.fn>;
  let worker: CheckoutReconciliationWorker;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T08:00:00.000Z'));
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    attempts = fakeAttempts();
    resumeAttempt = vi.fn();
    worker = createWorker();
  });

  afterEach(async () => {
    await worker.onModuleDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('resumes every persisted recovery action', async () => {
    const actions = Object.values(ReconciliationAction);
    attempts.claimDue.mockResolvedValue(
      actions.map((action, index) => claimedAttempt({ id: checkoutId(index), action })),
    );
    attempts.finishClaim.mockResolvedValue(true);
    resumeAttempt.mockResolvedValue({
      outcome: 'PENDING',
      checkoutId: checkoutId(0),
      status: 'RECONCILIATION_REQUIRED',
    });

    worker.onApplicationBootstrap();
    await runScheduledWork();

    expect(resumeAttempt).toHaveBeenCalledTimes(actions.length);
    expect(resumeAttempt.mock.calls.map(([attempt]) => attempt.reconciliationAction)).toEqual(
      actions,
    );
  });

  it.each([
    [0, '2026-09-22T08:00:05.000Z'],
    [1, '2026-09-22T08:00:30.000Z'],
    [2, '2026-09-22T08:02:00.000Z'],
    [3, '2026-09-22T08:10:00.000Z'],
  ])('schedules retry count %i using the defined backoff', async (retryCount, expected) => {
    const attempt = claimedAttempt({ retryCount });
    attempts.claimDue.mockResolvedValue([attempt]);
    attempts.finishClaim.mockResolvedValue(true);
    resumeAttempt.mockResolvedValue({
      outcome: 'PENDING',
      checkoutId: attempt.id,
      status: 'RECONCILIATION_REQUIRED',
    });

    worker.onApplicationBootstrap();
    await runScheduledWork();

    expect(attempts.finishClaim).toHaveBeenCalledWith(
      attempt.id,
      attempt.leaseOwner,
      new Date(expected),
    );
  });

  it('stops automatic processing at the maximum while retaining the attempt', async () => {
    const attempt = claimedAttempt({ retryCount: 4 });
    attempts.claimDue.mockResolvedValue([attempt]);
    attempts.finishClaim.mockResolvedValue(true);
    resumeAttempt.mockResolvedValue({
      outcome: 'PENDING',
      checkoutId: attempt.id,
      status: 'RECONCILIATION_REQUIRED',
    });

    worker.onApplicationBootstrap();
    await runScheduledWork();

    expect(attempts.finishClaim).toHaveBeenCalledWith(attempt.id, attempt.leaseOwner, null);
    expect(attempts.claimDue).toHaveBeenCalledWith(expect.objectContaining({ maxAttempts: 5 }));
  });

  it('persists unexpected worker failures with the original recovery action intact', async () => {
    const attempt = claimedAttempt({ action: ReconciliationAction.CheckOrder });
    attempts.claimDue.mockResolvedValue([attempt]);
    attempts.markClaimFailed.mockResolvedValue(true);
    resumeAttempt.mockRejectedValue(new Error('Order client crashed'));

    worker.onApplicationBootstrap();
    await runScheduledWork();

    expect(attempts.markClaimFailed).toHaveBeenCalledWith(
      attempt.id,
      attempt.leaseOwner,
      'Order client crashed',
      new Date('2026-09-22T08:00:05.000Z'),
    );
  });

  it('does not overlap polling passes in one process', async () => {
    const claim = deferred<CheckoutAttemptEntity[]>();
    attempts.claimDue.mockReturnValueOnce(claim.promise).mockResolvedValue([]);

    worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(attempts.claimDue).toHaveBeenCalledTimes(1);

    claim.resolve([]);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(attempts.claimDue).toHaveBeenCalledTimes(2);
  });

  it('stops scheduling new work during shutdown', async () => {
    attempts.claimDue.mockResolvedValue([]);
    worker.onApplicationBootstrap();
    await runScheduledWork();

    await worker.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(attempts.claimDue).toHaveBeenCalledTimes(1);
  });

  function createWorker(): CheckoutReconciliationWorker {
    const values: Record<string, number> = {
      CHECKOUT_RECONCILIATION_POLL_INTERVAL_MS: 1_000,
      CHECKOUT_RECONCILIATION_BATCH_SIZE: 10,
      CHECKOUT_RECONCILIATION_LEASE_MS: 30_000,
      CHECKOUT_RECONCILIATION_SHUTDOWN_TIMEOUT_MS: 5_000,
      CHECKOUT_RECONCILIATION_MAX_ATTEMPTS: 5,
    };
    const config = {
      get: vi.fn((name: string) => values[name]),
    } as unknown as ConfigService;
    const checkout = { resumeAttempt } as unknown as CheckoutCartUseCase;
    return new CheckoutReconciliationWorker(attempts, checkout, config);
  }

  async function runScheduledWork(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();
  }
});

function fakeAttempts(): Mocked<CheckoutAttemptRepositoryPort> {
  return {
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
}

function claimedAttempt(
  overrides: { id?: string; action?: ReconciliationAction; retryCount?: number } = {},
): CheckoutAttemptEntity {
  return new CheckoutAttemptEntity({
    id: overrides.id ?? checkoutId(0),
    userId: 10n,
    cartId: 20n,
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
    requestHash: 'a'.repeat(64),
    requestHashVersion: 2,
    itemsSnapshot: [
      {
        productSkuId: '100',
        productName: 'Keyboard',
        skuCode: 'KB-100',
        imageUrl: null,
        price: '19.90',
        regularPrice: '19.90',
        priceSource: 'REGULAR',
        quantity: 1,
      },
    ],
    status: CheckoutStatus.ReconciliationRequired,
    retryCount: overrides.retryCount ?? 0,
    reconciliationAction: overrides.action ?? ReconciliationAction.CheckOrder,
    leaseOwner: 'worker-1',
    leaseUntil: new Date('2026-09-22T08:00:30.000Z'),
    createdAt: new Date('2026-09-22T07:59:00.000Z'),
    updatedAt: new Date('2026-09-22T08:00:00.000Z'),
  });
}

function checkoutId(index: number): string {
  return `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}`;
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
