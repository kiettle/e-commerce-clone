import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidProductEventError } from '../../application/errors/invalid-product-event.error';
import { ProductOutboxStatus } from '../../application/enums/product-outbox-status.enum';
import { ProductEventTransportPort } from '../../application/ports/product-event-transport.port';
import {
  ClaimedProductOutboxEvent,
  ProductOutboxRepositoryPort,
} from '../../application/ports/product-outbox.repository.port';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import { ProductOutboxPublisherWorker } from './product-outbox-publisher.worker';

describe('ProductOutboxPublisherWorker', () => {
  let outbox: ProductOutboxRepositoryPort;
  let transport: ProductEventTransportPort;
  let worker: ProductOutboxPublisherWorker;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-20T08:00:00.000Z');
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    outbox = fakeOutbox();
    transport = fakeTransport();
    worker = createWorker(outbox, transport);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits for the next poll after an empty batch', async () => {
    vi.mocked(outbox.claimBatch).mockResolvedValue([]);

    worker.onApplicationBootstrap();
    await runScheduledWork();

    expect(outbox.claimBatch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(outbox.claimBatch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(outbox.claimBatch).toHaveBeenCalledTimes(2);
  });

  it('marks an event published only after transport acknowledgement', async () => {
    const event = claimedEvent();
    vi.mocked(outbox.claimBatch).mockResolvedValueOnce([event]).mockResolvedValue([]);
    vi.mocked(transport.publish).mockResolvedValue();
    vi.mocked(outbox.markPublished).mockResolvedValue(true);

    worker.onApplicationBootstrap();
    await runScheduledWork();

    expect(transport.publish).toHaveBeenCalledWith({
      eventId: event.id,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      partitionKey: event.partitionKey,
      occurredAt: event.occurredAt,
      payload: event.payload,
    });
    expect(outbox.markPublished).toHaveBeenCalledWith(
      event.id,
      event.leaseOwner,
      new Date('2026-09-20T08:00:00.000Z'),
    );
    expect(vi.mocked(transport.publish).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(outbox.markPublished).mock.invocationCallOrder[0],
    );
  });

  it('schedules a retry when Kafka publishing fails', async () => {
    const event = claimedEvent();
    vi.mocked(outbox.claimBatch).mockResolvedValueOnce([event]).mockResolvedValue([]);
    vi.mocked(transport.publish).mockRejectedValue(new Error('Kafka unavailable'));
    vi.mocked(outbox.markFailedAttempt).mockResolvedValue(true);

    worker.onApplicationBootstrap();
    await runScheduledWork();

    expect(outbox.markFailedAttempt).toHaveBeenCalledWith({
      id: event.id,
      leaseOwner: event.leaseOwner,
      error: 'Kafka unavailable',
      status: ProductOutboxStatus.Pending,
      nextAttemptAt: new Date('2026-09-20T08:00:05.000Z'),
    });
    expect(outbox.markPublished).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining(`Outbox event ${event.id} publish attempt 1 failed`),
    );
    expect(Logger.prototype.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Mechanical Keyboard'),
    );
  });

  it.each([
    { attemptCount: 1, nextAttemptAt: '2026-09-20T08:00:30.000Z' },
    { attemptCount: 2, nextAttemptAt: '2026-09-20T08:02:00.000Z' },
    { attemptCount: 3, nextAttemptAt: '2026-09-20T08:10:00.000Z' },
  ])(
    'uses the defined backoff after failed attempt $attemptCount',
    async ({ attemptCount, nextAttemptAt }) => {
      const event = claimedEvent({ attemptCount });
      vi.mocked(outbox.claimBatch).mockResolvedValueOnce([event]).mockResolvedValue([]);
      vi.mocked(transport.publish).mockRejectedValue(new Error('Kafka unavailable'));
      vi.mocked(outbox.markFailedAttempt).mockResolvedValue(true);

      worker.onApplicationBootstrap();
      await runScheduledWork();

      expect(outbox.markFailedAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ProductOutboxStatus.Pending,
          nextAttemptAt: new Date(nextAttemptAt),
        }),
      );
    },
  );

  it.each([
    ['PRODUCT_OUTBOX_POLL_INTERVAL_MS', 249],
    ['PRODUCT_OUTBOX_POLL_INTERVAL_MS', 60_001],
    ['PRODUCT_OUTBOX_BATCH_SIZE', 0],
    ['PRODUCT_OUTBOX_BATCH_SIZE', 101],
    ['PRODUCT_OUTBOX_LEASE_MS', 4_999],
    ['PRODUCT_OUTBOX_LEASE_MS', 300_001],
    ['PRODUCT_OUTBOX_MAX_ATTEMPTS', 0],
    ['PRODUCT_OUTBOX_MAX_ATTEMPTS', 21],
  ])('rejects invalid %s configuration', (name, value) => {
    expect(() => createWorker(outbox, transport, { [name]: value })).toThrow(
      `${name} must be an integer between`,
    );
  });

  it('continues publishing after one row fails', async () => {
    const first = claimedEvent({ id: 'event-1' });
    const second = claimedEvent({ id: 'event-2', partitionKey: '21' });
    vi.mocked(outbox.claimBatch).mockResolvedValueOnce([first, second]).mockResolvedValue([]);
    vi.mocked(transport.publish)
      .mockRejectedValueOnce(new Error('Kafka unavailable'))
      .mockResolvedValueOnce();
    vi.mocked(outbox.markFailedAttempt).mockResolvedValue(true);
    vi.mocked(outbox.markPublished).mockResolvedValue(true);

    worker.onApplicationBootstrap();
    await runScheduledWork();

    expect(transport.publish).toHaveBeenCalledTimes(2);
    expect(outbox.markFailedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ id: first.id }),
    );
    expect(outbox.markPublished).toHaveBeenCalledWith(
      second.id,
      second.leaseOwner,
      expect.any(Date),
    );
  });

  it('marks invalid stored data as a terminal failure', async () => {
    const event = claimedEvent();
    vi.mocked(outbox.claimBatch).mockResolvedValueOnce([event]).mockResolvedValue([]);
    vi.mocked(transport.publish).mockRejectedValue(
      new InvalidProductEventError('productId must be a decimal string'),
    );
    vi.mocked(outbox.markFailedAttempt).mockResolvedValue(true);

    worker.onApplicationBootstrap();
    await runScheduledWork();

    expect(outbox.markFailedAttempt).toHaveBeenCalledWith({
      id: event.id,
      leaseOwner: event.leaseOwner,
      error: 'productId must be a decimal string',
      status: ProductOutboxStatus.Failed,
      nextAttemptAt: null,
    });
  });

  it('does not overlap polling passes', async () => {
    const firstClaim = deferred<ClaimedProductOutboxEvent[]>();
    vi.mocked(outbox.claimBatch).mockReturnValueOnce(firstClaim.promise).mockResolvedValue([]);

    worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(outbox.claimBatch).toHaveBeenCalledTimes(1);

    firstClaim.resolve([]);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(outbox.claimBatch).toHaveBeenCalledTimes(2);
  });

  it('stops future polling during shutdown', async () => {
    vi.mocked(outbox.claimBatch).mockResolvedValue([]);
    worker.onApplicationBootstrap();
    await runScheduledWork();

    await worker.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(outbox.claimBatch).toHaveBeenCalledTimes(1);
  });

  it('allows the active event operation to finish during shutdown', async () => {
    const publication = deferred<void>();
    vi.mocked(outbox.claimBatch).mockResolvedValueOnce([claimedEvent()]);
    vi.mocked(transport.publish).mockReturnValueOnce(publication.promise);
    vi.mocked(outbox.markPublished).mockResolvedValue(true);

    worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    const shutdown = worker.onModuleDestroy();
    let shutdownFinished = false;
    void shutdown.then(() => {
      shutdownFinished = true;
    });

    await flushPromises();
    expect(shutdownFinished).toBe(false);

    publication.resolve();
    await shutdown;

    expect(outbox.markPublished).toHaveBeenCalledTimes(1);
    expect(shutdownFinished).toBe(true);
  });

  it('does not publish an event before it is claimed', async () => {
    const claim = deferred<ClaimedProductOutboxEvent[]>();
    vi.mocked(outbox.claimBatch).mockReturnValueOnce(claim.promise);
    vi.mocked(transport.publish).mockResolvedValue();
    vi.mocked(outbox.markPublished).mockResolvedValue(true);

    worker.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    expect(transport.publish).not.toHaveBeenCalled();

    claim.resolve([claimedEvent()]);
    await flushPromises();

    expect(transport.publish).toHaveBeenCalledTimes(1);
  });

  it('stops retrying a row after the configured maximum attempt', async () => {
    const event = claimedEvent({ attemptCount: 2 });
    worker = createWorker(outbox, transport, {
      PRODUCT_OUTBOX_MAX_ATTEMPTS: 3,
    });
    vi.mocked(outbox.claimBatch).mockResolvedValueOnce([event]).mockResolvedValue([]);
    vi.mocked(transport.publish).mockRejectedValue(new Error('Kafka unavailable'));
    vi.mocked(outbox.markFailedAttempt).mockResolvedValue(true);

    worker.onApplicationBootstrap();
    await runScheduledWork();

    expect(outbox.markFailedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ProductOutboxStatus.Failed,
        nextAttemptAt: null,
      }),
    );
  });

  function createWorker(
    repository: ProductOutboxRepositoryPort,
    eventTransport: ProductEventTransportPort,
    overrides: Record<string, string | number> = {},
  ): ProductOutboxPublisherWorker {
    const values: Record<string, string | number> = {
      PRODUCT_OUTBOX_POLL_INTERVAL_MS: 1_000,
      PRODUCT_OUTBOX_BATCH_SIZE: 10,
      PRODUCT_OUTBOX_LEASE_MS: 30_000,
      PRODUCT_OUTBOX_SHUTDOWN_TIMEOUT_MS: 5_000,
      PRODUCT_OUTBOX_MAX_ATTEMPTS: 5,
      ...overrides,
    };
    const config = {
      get: vi.fn((name: string) => values[name]),
    } as unknown as ConfigService;

    return new ProductOutboxPublisherWorker(repository, eventTransport, config);
  }

  async function runScheduledWork(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();
  }

  async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
});

function fakeOutbox(): ProductOutboxRepositoryPort {
  return {
    claimBatch: vi.fn(),
    markPublished: vi.fn(),
    markFailedAttempt: vi.fn(),
    replayFailed: vi.fn(),
  };
}

function fakeTransport(): ProductEventTransportPort {
  return {
    publish: vi.fn(),
  };
}

function claimedEvent(
  overrides: Partial<ClaimedProductOutboxEvent> = {},
): ClaimedProductOutboxEvent {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    aggregateId: 20n,
    eventType: 'PRODUCT_CREATED',
    schemaVersion: 1,
    partitionKey: '20',
    occurredAt: new Date('2026-09-20T07:59:00.000Z'),
    payload: {
      productId: '20',
      name: 'Mechanical Keyboard',
      skus: [
        {
          productSkuId: '101',
          skuCode: 'KEYBOARD-BLACK',
          status: ProductSkuStatus.Available,
          quantity: 12,
        },
      ],
    },
    attemptCount: 0,
    leaseOwner: 'worker-1',
    leaseUntil: new Date('2026-09-20T08:00:30.000Z'),
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
