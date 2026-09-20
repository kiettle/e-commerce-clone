import { ProductOutboxStatus } from '../enums/product-outbox-status.enum';
import { ProductEvent } from './product-event-transport.port';

export const PRODUCT_OUTBOX_REPOSITORY = Symbol('PRODUCT_OUTBOX_REPOSITORY');

export interface ClaimedProductOutboxEvent extends ProductEvent {
  attemptCount: number;
  leaseOwner: string;
  leaseUntil: Date;
}

export interface ClaimProductOutboxBatch {
  limit: number;
  leaseOwner: string;
  leaseUntil: Date;
  now: Date;
}

export interface FailedProductOutboxAttempt {
  id: string;
  leaseOwner: string;
  error: string;
  status: ProductOutboxStatus.Pending | ProductOutboxStatus.Failed;
  nextAttemptAt: Date | null;
}

export interface ProductOutboxRepositoryPort {
  claimBatch(
    request: ClaimProductOutboxBatch,
  ): Promise<ClaimedProductOutboxEvent[]>;
  markPublished(id: string, leaseOwner: string, publishedAt: Date): Promise<void>;
  markFailedAttempt(attempt: FailedProductOutboxAttempt): Promise<void>;
  replayFailed(id: string, nextAttemptAt: Date): Promise<void>;
}
