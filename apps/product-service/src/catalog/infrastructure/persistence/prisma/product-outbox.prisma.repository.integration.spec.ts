import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../../../../../../prisma/generated/product';
import { ProductOutboxStatus } from '../../../application/enums/product-outbox-status.enum';
import { ProductEventTransportPort } from '../../../application/ports/product-event-transport.port';
import { ProductOutboxPublisherWorker } from '../../messaging/product-outbox-publisher.worker';
import { PrismaProductOutboxRepository } from './product-outbox.prisma.repository';
import { PrismaService } from './prisma.service';

const integrationDatabaseUrl = process.env.PRODUCT_INTEGRATION_DATABASE_URL;
const describeWithDatabase = integrationDatabaseUrl ? describe : describe.skip;
const now = new Date('2026-09-20T12:00:00.000Z');
const dueAt = new Date('2026-09-20T11:59:00.000Z');
const futureAt = new Date('2026-09-20T12:01:00.000Z');
const leaseUntil = new Date('2026-09-20T12:05:00.000Z');

describeWithDatabase('PrismaProductOutboxRepository', () => {
  let prisma: PrismaClient;
  let repository: PrismaProductOutboxRepository;

  beforeAll(() => {
    if (!integrationDatabaseUrl) {
      throw new Error('PRODUCT_INTEGRATION_DATABASE_URL is required.');
    }

    const databaseName = new URL(integrationDatabaseUrl).pathname.slice(1);
    if (!databaseName.endsWith('_test')) {
      throw new Error('Product integration tests require a *_test database.');
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: integrationDatabaseUrl }),
    });
    repository = new PrismaProductOutboxRepository(prisma as unknown as PrismaService);
  });

  beforeEach(async () => {
    await prisma.productOutboxEvent.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('lets two workers claim disjoint batches', async () => {
    await Promise.all([
      insertEvent({ id: eventId(1), createdAt: new Date('2026-09-20T10:00:01Z') }),
      insertEvent({ id: eventId(2), createdAt: new Date('2026-09-20T10:00:02Z') }),
      insertEvent({ id: eventId(3), createdAt: new Date('2026-09-20T10:00:03Z') }),
      insertEvent({ id: eventId(4), createdAt: new Date('2026-09-20T10:00:04Z') }),
    ]);

    const [workerA, workerB] = await Promise.all([
      repository.claimBatch(claimRequest('worker-a', 2)),
      repository.claimBatch(claimRequest('worker-b', 2)),
    ]);

    expect(workerA).toHaveLength(2);
    expect(workerB).toHaveLength(2);
    expect(new Set([...workerA, ...workerB].map((event) => event.id)).size).toBe(4);
    expect(workerA.some((event) => workerB.some((other) => other.id === event.id))).toBe(false);
  });

  it('does not steal an active lease', async () => {
    await insertEvent({
      id: eventId(1),
      status: ProductOutboxStatus.Processing,
      leaseOwner: 'worker-a',
      leaseUntil: futureAt,
    });

    await expect(repository.claimBatch(claimRequest('worker-b'))).resolves.toEqual([]);
  });

  it('reclaims an expired lease', async () => {
    await insertEvent({
      id: eventId(1),
      status: ProductOutboxStatus.Processing,
      leaseOwner: 'worker-a',
      leaseUntil: dueAt,
    });

    const [claimed] = await repository.claimBatch(claimRequest('worker-b'));

    expect(claimed).toMatchObject({
      id: eventId(1),
      leaseOwner: 'worker-b',
      leaseUntil,
    });
  });

  it('prevents a stale worker from updating another worker lease', async () => {
    await insertEvent({
      id: eventId(1),
      status: ProductOutboxStatus.Processing,
      leaseOwner: 'worker-a',
      leaseUntil: dueAt,
    });
    await repository.claimBatch(claimRequest('worker-b'));

    await expect(repository.markPublished(eventId(1), 'worker-a', now)).resolves.toBe(false);
    await expect(
      repository.markFailedAttempt({
        id: eventId(1),
        leaseOwner: 'worker-a',
        error: 'Late failure.',
        status: ProductOutboxStatus.Pending,
        nextAttemptAt: futureAt,
      }),
    ).resolves.toBe(false);
    await expect(
      prisma.productOutboxEvent.findUniqueOrThrow({ where: { id: eventId(1) } }),
    ).resolves.toMatchObject({
      status: ProductOutboxStatus.Processing,
      leaseOwner: 'worker-b',
      attemptCount: 0,
      publishedAt: null,
    });
  });

  it('claims only pending events whose retry time is due', async () => {
    await insertEvent({ id: eventId(1), nextAttemptAt: dueAt });
    await insertEvent({ id: eventId(2), nextAttemptAt: futureAt });

    const claimed = await repository.claimBatch(claimRequest('worker-a'));

    expect(claimed.map((event) => event.id)).toEqual([eventId(1)]);
  });

  it('claims events in created-at and ID order', async () => {
    const sameTime = new Date('2026-09-20T10:00:02.000Z');
    await insertEvent({ id: eventId(3), createdAt: sameTime });
    await insertEvent({ id: eventId(2), createdAt: sameTime });
    await insertEvent({ id: eventId(1), createdAt: new Date('2026-09-20T10:00:01Z') });

    const claimed = await repository.claimBatch(claimRequest('worker-a'));

    expect(claimed.map((event) => event.id)).toEqual([eventId(1), eventId(2), eventId(3)]);
  });

  it('respects the maximum batch size', async () => {
    await Promise.all([
      insertEvent({ id: eventId(1) }),
      insertEvent({ id: eventId(2) }),
      insertEvent({ id: eventId(3) }),
    ]);

    await expect(repository.claimBatch(claimRequest('worker-a', 2))).resolves.toHaveLength(2);
  });

  it('does not automatically claim failed events', async () => {
    await insertEvent({
      id: eventId(1),
      status: ProductOutboxStatus.Failed,
      nextAttemptAt: null,
    });

    await expect(repository.claimBatch(claimRequest('worker-a'))).resolves.toEqual([]);
  });

  it('never claims published events', async () => {
    await insertEvent({
      id: eventId(1),
      status: ProductOutboxStatus.Published,
      nextAttemptAt: null,
      publishedAt: dueAt,
    });

    await expect(repository.claimBatch(claimRequest('worker-a'))).resolves.toEqual([]);
  });

  it('records a transient failure with the supplied retry time', async () => {
    await insertEvent({ id: eventId(1) });
    await repository.claimBatch(claimRequest('worker-a'));

    await expect(
      repository.markFailedAttempt({
        id: eventId(1),
        leaseOwner: 'worker-a',
        error: '  Kafka\n unavailable\t retrying  ',
        status: ProductOutboxStatus.Pending,
        nextAttemptAt: futureAt,
      }),
    ).resolves.toBe(true);
    await expect(
      prisma.productOutboxEvent.findUniqueOrThrow({ where: { id: eventId(1) } }),
    ).resolves.toMatchObject({
      attemptCount: 1,
      status: ProductOutboxStatus.Pending,
      nextAttemptAt: futureAt,
      lastError: 'Kafka unavailable retrying',
      leaseOwner: null,
      leaseUntil: null,
    });
  });

  it('records a final failure without another retry time', async () => {
    await insertEvent({ id: eventId(1) });
    await repository.claimBatch(claimRequest('worker-a'));

    await expect(
      repository.markFailedAttempt({
        id: eventId(1),
        leaseOwner: 'worker-a',
        error: 'Unsupported schema.',
        status: ProductOutboxStatus.Failed,
        nextAttemptAt: futureAt,
      }),
    ).resolves.toBe(true);
    await expect(
      prisma.productOutboxEvent.findUniqueOrThrow({ where: { id: eventId(1) } }),
    ).resolves.toMatchObject({
      attemptCount: 1,
      status: ProductOutboxStatus.Failed,
      nextAttemptAt: null,
      lastError: 'Unsupported schema.',
      leaseOwner: null,
      leaseUntil: null,
    });
  });

  it('marks a matching lease as published after acknowledgement', async () => {
    await insertEvent({ id: eventId(1), lastError: 'Previous failure.' });
    await repository.claimBatch(claimRequest('worker-a'));

    await expect(repository.markPublished(eventId(1), 'worker-a', now)).resolves.toBe(true);
    await expect(
      prisma.productOutboxEvent.findUniqueOrThrow({ where: { id: eventId(1) } }),
    ).resolves.toMatchObject({
      attemptCount: 1,
      status: ProductOutboxStatus.Published,
      nextAttemptAt: null,
      publishedAt: now,
      lastError: null,
      leaseOwner: null,
      leaseUntil: null,
    });
  });

  it('resets retry state while preserving a failed event envelope', async () => {
    const original = await insertEvent({
      id: eventId(1),
      status: ProductOutboxStatus.Failed,
      attemptCount: 5,
      nextAttemptAt: null,
      lastError: 'Stored payload was invalid.',
      leaseOwner: 'stale-worker',
      leaseUntil: dueAt,
      publishedAt: dueAt,
    });
    const replayAt = new Date('2026-09-20T12:10:00.000Z');

    await expect(repository.replayFailed(original.id, replayAt)).resolves.toEqual({
      state: 'REPLAYED',
    });

    const replayed = await prisma.productOutboxEvent.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(replayed).toMatchObject({
      id: original.id,
      aggregateType: original.aggregateType,
      aggregateId: original.aggregateId,
      aggregateVersion: original.aggregateVersion,
      eventType: original.eventType,
      schemaVersion: original.schemaVersion,
      partitionKey: original.partitionKey,
      occurredAt: original.occurredAt,
      payload: original.payload,
      createdAt: original.createdAt,
      status: ProductOutboxStatus.Pending,
      attemptCount: 0,
      nextAttemptAt: replayAt,
      lastError: null,
      leaseOwner: null,
      leaseUntil: null,
      publishedAt: null,
    });
    await expect(prisma.productOutboxEvent.count({ where: { id: original.id } })).resolves.toBe(1);
  });

  it('leaves an already-pending event unchanged', async () => {
    const original = await insertEvent({
      id: eventId(1),
      attemptCount: 2,
      nextAttemptAt: futureAt,
      lastError: 'Kafka unavailable.',
    });

    await expect(repository.replayFailed(original.id, now)).resolves.toEqual({
      state: 'ALREADY_PENDING',
    });
    await expect(
      prisma.productOutboxEvent.findUniqueOrThrow({ where: { id: original.id } }),
    ).resolves.toMatchObject({
      attemptCount: 2,
      nextAttemptAt: futureAt,
      lastError: 'Kafka unavailable.',
    });
    await expect(prisma.productOutboxEvent.count({ where: { id: original.id } })).resolves.toBe(1);
  });

  it('reports processing, published, and unknown events without changing them', async () => {
    await insertEvent({
      id: eventId(1),
      status: ProductOutboxStatus.Processing,
      leaseOwner: 'worker-a',
      leaseUntil: futureAt,
    });
    await insertEvent({
      id: eventId(2),
      status: ProductOutboxStatus.Published,
      nextAttemptAt: null,
      publishedAt: dueAt,
    });

    await expect(repository.replayFailed(eventId(1), now)).resolves.toEqual({
      state: 'PROCESSING',
      leaseUntil: futureAt,
    });
    await expect(repository.replayFailed(eventId(2), now)).resolves.toEqual({
      state: 'PUBLISHED',
    });
    await expect(repository.replayFailed(eventId(3), now)).resolves.toEqual({
      state: 'NOT_FOUND',
    });
    await expect(
      prisma.productOutboxEvent.findUniqueOrThrow({ where: { id: eventId(1) } }),
    ).resolves.toMatchObject({
      status: ProductOutboxStatus.Processing,
      leaseOwner: 'worker-a',
      leaseUntil: futureAt,
    });
  });

  it('publishes every due event with two competing workers', async () => {
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        insertEvent({
          id: eventId(index + 1),
          createdAt: new Date(`2026-09-20T10:00:0${index + 1}.000Z`),
          nextAttemptAt: new Date(0),
        }),
      ),
    );
    const publishedByA: string[] = [];
    const publishedByB: string[] = [];
    const workerA = new ProductOutboxPublisherWorker(
      repository,
      recordingTransport(publishedByA),
      workerConfig(),
    );
    const workerB = new ProductOutboxPublisherWorker(
      repository,
      recordingTransport(publishedByB),
      workerConfig(),
    );

    workerA.onApplicationBootstrap();
    workerB.onApplicationBootstrap();

    try {
      await waitFor(async () => {
        const published = await prisma.productOutboxEvent.count({
          where: { status: ProductOutboxStatus.Published },
        });
        return published === 6;
      });
    } finally {
      await Promise.all([workerA.onModuleDestroy(), workerB.onModuleDestroy()]);
    }

    const publishedIds = [...publishedByA, ...publishedByB];
    expect(publishedIds).toHaveLength(6);
    expect(new Set(publishedIds).size).toBe(6);
    await expect(
      prisma.productOutboxEvent.count({
        where: {
          OR: [
            { status: { not: ProductOutboxStatus.Published } },
            { leaseOwner: { not: null } },
            { leaseUntil: { not: null } },
          ],
        },
      }),
    ).resolves.toBe(0);
  });

  function claimRequest(leaseOwner: string, limit = 10) {
    return { limit, leaseOwner, now, leaseUntil };
  }

  async function insertEvent(
    values: Partial<{
      id: string;
      status: ProductOutboxStatus;
      nextAttemptAt: Date | null;
      leaseOwner: string | null;
      leaseUntil: Date | null;
      publishedAt: Date | null;
      lastError: string | null;
      attemptCount: number;
      createdAt: Date;
    }> = {},
  ) {
    const id = values.id ?? eventId(1);
    return prisma.productOutboxEvent.create({
      data: {
        id,
        aggregateType: 'PRODUCT',
        aggregateId: BigInt(id.slice(-12)),
        aggregateVersion: 1,
        eventType: 'PRODUCT_CREATED',
        schemaVersion: 1,
        partitionKey: id,
        occurredAt: dueAt,
        payload: {
          productId: '20',
          name: 'Mechanical Keyboard',
          skus: [],
        },
        status: values.status ?? ProductOutboxStatus.Pending,
        nextAttemptAt: values.nextAttemptAt === undefined ? dueAt : values.nextAttemptAt,
        leaseOwner: values.leaseOwner,
        leaseUntil: values.leaseUntil,
        publishedAt: values.publishedAt,
        lastError: values.lastError,
        attemptCount: values.attemptCount,
        createdAt: values.createdAt,
      },
    });
  }
});

function eventId(sequence: number): string {
  return `550e8400-e29b-41d4-a716-${sequence.toString().padStart(12, '0')}`;
}

function recordingTransport(publishedIds: string[]): ProductEventTransportPort {
  return {
    publish: async (event) => {
      publishedIds.push(event.eventId);
    },
  };
}

function workerConfig(): ConfigService {
  const values: Record<string, number> = {
    PRODUCT_OUTBOX_POLL_INTERVAL_MS: 250,
    PRODUCT_OUTBOX_BATCH_SIZE: 2,
    PRODUCT_OUTBOX_LEASE_MS: 5_000,
    PRODUCT_OUTBOX_SHUTDOWN_TIMEOUT_MS: 1_000,
    PRODUCT_OUTBOX_MAX_ATTEMPTS: 3,
  };

  return {
    get: (name: string) => values[name],
  } as ConfigService;
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Condition was not met within ${timeoutMs}ms.`);
}
