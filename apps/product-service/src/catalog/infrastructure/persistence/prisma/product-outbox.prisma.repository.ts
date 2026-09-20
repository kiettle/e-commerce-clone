import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../../../prisma/generated/product';
import { ProductOutboxStatus } from '../../../application/enums/product-outbox-status.enum';
import {
  ClaimedProductOutboxEvent,
  ClaimProductOutboxBatch,
  FailedProductOutboxAttempt,
  ProductOutboxRepositoryPort,
  ReplayProductOutboxResult,
} from '../../../application/ports/product-outbox.repository.port';
import { PrismaService } from './prisma.service';

interface ClaimedOutboxRow {
  id: string;
  aggregate_id: bigint;
  event_type: string;
  schema_version: number;
  partition_key: string;
  occurred_at: Date;
  payload: unknown;
  attempt_count: number;
  lease_owner: string;
  lease_until: Date;
}

@Injectable()
export class PrismaProductOutboxRepository implements ProductOutboxRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async claimBatch(request: ClaimProductOutboxBatch): Promise<ClaimedProductOutboxEvent[]> {
    validateClaimRequest(request);

    const rows = await this.prisma.$transaction((transaction) =>
      transaction.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
        WITH claimable AS MATERIALIZED (
          SELECT "id"
          FROM "product_outbox_events"
          WHERE (
            (
              "status" = 'PENDING'::"ProductOutboxStatus"
              AND "next_attempt_at" <= ${request.now}
            ) OR (
              "status" = 'PROCESSING'::"ProductOutboxStatus"
              AND "lease_until" <= ${request.now}
            )
          )
          ORDER BY "created_at" ASC, "id" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${request.limit}
        ), claimed AS (
          UPDATE "product_outbox_events" AS event
          SET
            "status" = 'PROCESSING'::"ProductOutboxStatus",
            "lease_owner" = ${request.leaseOwner},
            "lease_until" = ${request.leaseUntil},
            "updated_at" = ${request.now}
          FROM claimable
          WHERE event."id" = claimable."id"
          RETURNING event.*
        )
        SELECT
          "id",
          "aggregate_id",
          "event_type",
          "schema_version",
          "partition_key",
          "occurred_at",
          "payload",
          "attempt_count",
          "lease_owner",
          "lease_until"
        FROM claimed
        ORDER BY "created_at" ASC, "id" ASC
      `),
    );

    return rows.map((row) => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      schemaVersion: row.schema_version,
      partitionKey: row.partition_key,
      occurredAt: row.occurred_at,
      payload: row.payload as Record<string, unknown>,
      attemptCount: row.attempt_count,
      leaseOwner: row.lease_owner,
      leaseUntil: row.lease_until,
    }));
  }

  async markPublished(id: string, leaseOwner: string, publishedAt: Date): Promise<boolean> {
    assertValidDate(publishedAt, 'publishedAt');

    const result = await this.prisma.productOutboxEvent.updateMany({
      where: {
        id,
        status: ProductOutboxStatus.Processing,
        leaseOwner,
      },
      data: {
        attemptCount: { increment: 1 },
        status: ProductOutboxStatus.Published,
        publishedAt,
        nextAttemptAt: null,
        lastError: null,
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: publishedAt,
      },
    });

    return result.count === 1;
  }

  async markFailedAttempt(attempt: FailedProductOutboxAttempt): Promise<boolean> {
    if (attempt.status === ProductOutboxStatus.Pending && attempt.nextAttemptAt === null) {
      throw new Error('A transient outbox failure requires the next retry time.');
    }

    if (attempt.nextAttemptAt) {
      assertValidDate(attempt.nextAttemptAt, 'nextAttemptAt');
    }

    const nextAttemptAt =
      attempt.status === ProductOutboxStatus.Pending ? attempt.nextAttemptAt : null;
    const result = await this.prisma.productOutboxEvent.updateMany({
      where: {
        id: attempt.id,
        status: ProductOutboxStatus.Processing,
        leaseOwner: attempt.leaseOwner,
      },
      data: {
        attemptCount: { increment: 1 },
        status: attempt.status,
        nextAttemptAt,
        lastError: sanitizeError(attempt.error),
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: new Date(),
      },
    });

    return result.count === 1;
  }

  async replayFailed(id: string, nextAttemptAt: Date): Promise<ReplayProductOutboxResult> {
    assertValidDate(nextAttemptAt, 'nextAttemptAt');

    const replayed = await this.prisma.productOutboxEvent.updateMany({
      where: {
        id,
        status: ProductOutboxStatus.Failed,
      },
      data: {
        status: ProductOutboxStatus.Pending,
        attemptCount: 0,
        nextAttemptAt,
        lastError: null,
        leaseOwner: null,
        leaseUntil: null,
        publishedAt: null,
        updatedAt: nextAttemptAt,
      },
    });

    if (replayed.count === 1) {
      return { state: 'REPLAYED' };
    }

    const event = await this.prisma.productOutboxEvent.findUnique({
      where: { id },
      select: {
        status: true,
        leaseUntil: true,
      },
    });

    if (!event) {
      return { state: 'NOT_FOUND' };
    }

    if (event.status === ProductOutboxStatus.Pending) {
      return { state: 'ALREADY_PENDING' };
    }

    if (event.status === ProductOutboxStatus.Processing) {
      return { state: 'PROCESSING', leaseUntil: event.leaseUntil };
    }

    return { state: 'PUBLISHED' };
  }
}

function validateClaimRequest(request: ClaimProductOutboxBatch): void {
  if (!Number.isInteger(request.limit) || request.limit <= 0) {
    throw new Error('Outbox claim limit must be a positive integer.');
  }

  if (!request.leaseOwner.trim()) {
    throw new Error('Outbox lease owner must not be empty.');
  }

  assertValidDate(request.now, 'now');
  assertValidDate(request.leaseUntil, 'leaseUntil');

  if (request.leaseUntil <= request.now) {
    throw new Error('Outbox lease must end after the claim time.');
  }
}

function assertValidDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Outbox ${field} must be a valid date.`);
  }
}

function sanitizeError(error: string): string {
  const sanitized = error.replaceAll('\0', '').replace(/\s+/g, ' ').trim();
  return (sanitized || 'Event publication failed.').slice(0, 1_000);
}
