import { Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { InvalidProductEventError } from '../../application/errors/invalid-product-event.error';
import { ProductOutboxStatus } from '../../application/enums/product-outbox-status.enum';
import { ProductEventTransportPort } from '../../application/ports/product-event-transport.port';
import {
  ClaimedProductOutboxEvent,
  ProductOutboxRepositoryPort,
} from '../../application/ports/product-outbox.repository.port';

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];

export class ProductOutboxPublisherWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ProductOutboxPublisherWorker.name);
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly leaseDurationMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly maxAttempts: number;
  private workerId?: string;
  private timer?: ReturnType<typeof setTimeout>;
  private currentPass?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly outbox: ProductOutboxRepositoryPort,
    private readonly transport: ProductEventTransportPort,
    config: ConfigService,
  ) {
    this.pollIntervalMs = boundedInteger(
      config,
      'PRODUCT_OUTBOX_POLL_INTERVAL_MS',
      2_000,
      250,
      60_000,
    );
    this.batchSize = boundedInteger(config, 'PRODUCT_OUTBOX_BATCH_SIZE', 20, 1, 100);
    this.leaseDurationMs = boundedInteger(
      config,
      'PRODUCT_OUTBOX_LEASE_MS',
      30_000,
      5_000,
      300_000,
    );
    this.shutdownTimeoutMs = positiveInteger(config, 'PRODUCT_OUTBOX_SHUTDOWN_TIMEOUT_MS', 10_000);
    this.maxAttempts = boundedInteger(config, 'PRODUCT_OUTBOX_MAX_ATTEMPTS', 5, 1, 20);
  }

  onApplicationBootstrap(): void {
    this.workerId = `${hostname()}:${process.pid}:${randomUUID()}`;
    this.scheduleNextPass(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    const currentPass = this.currentPass;
    if (!currentPass) {
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      currentPass,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, this.shutdownTimeoutMs);
      }),
    ]);

    if (timeout) {
      clearTimeout(timeout);
    }
  }

  private scheduleNextPass(delayMs: number): void {
    if (this.stopping) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      const pass = this.runPass();
      this.currentPass = pass;
      void pass.then(
        () => this.finishPass(pass),
        (error: unknown) => {
          this.logger.warn(`Product outbox polling failed: ${safeErrorMessage(error)}`);
          this.finishPass(pass);
        },
      );
    }, delayMs);
  }

  private finishPass(pass: Promise<void>): void {
    if (this.currentPass === pass) {
      this.currentPass = undefined;
    }

    this.scheduleNextPass(this.pollIntervalMs);
  }

  private async runPass(): Promise<void> {
    if (this.stopping || !this.workerId) {
      return;
    }

    const now = new Date();
    const events = await this.outbox.claimBatch({
      limit: this.batchSize,
      leaseOwner: this.workerId,
      leaseUntil: new Date(now.getTime() + this.leaseDurationMs),
      now,
    });

    for (const event of events) {
      if (this.stopping) {
        break;
      }

      try {
        await this.publishEvent(event);
      } catch (error) {
        this.logger.error(
          `Outbox event ${event.id} could not update its state: ${safeErrorMessage(error)}`,
        );
      }
    }
  }

  private async publishEvent(event: ClaimedProductOutboxEvent): Promise<void> {
    const attemptNumber = event.attemptCount + 1;

    try {
      await this.transport.publish({
        eventId: event.id,
        eventType: event.eventType,
        schemaVersion: event.schemaVersion,
        partitionKey: event.partitionKey,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
    } catch (error) {
      await this.recordFailure(event, attemptNumber, error);
      return;
    }

    const updated = await this.outbox.markPublished(event.id, event.leaseOwner, new Date());
    if (!updated) {
      this.logger.warn(`Outbox event ${event.id} was published after its lease was lost.`);
    }
  }

  private async recordFailure(
    event: ClaimedProductOutboxEvent,
    attemptNumber: number,
    error: unknown,
  ): Promise<void> {
    const reason = safeErrorMessage(error);
    const isInvalidPayload = error instanceof InvalidProductEventError;
    const isFinalAttempt = attemptNumber >= this.maxAttempts;
    const status =
      isInvalidPayload || isFinalAttempt ? ProductOutboxStatus.Failed : ProductOutboxStatus.Pending;
    const nextAttemptAt =
      status === ProductOutboxStatus.Pending
        ? new Date(Date.now() + this.retryDelay(attemptNumber))
        : null;

    if (isInvalidPayload) {
      this.logger.error(`Outbox event ${event.id} has invalid stored data: ${reason}`);
    } else {
      this.logger.warn(
        `Outbox event ${event.id} publish attempt ${attemptNumber} failed: ${reason}`,
      );
    }

    const updated = await this.outbox.markFailedAttempt({
      id: event.id,
      leaseOwner: event.leaseOwner,
      error: reason,
      status,
      nextAttemptAt,
    });

    if (!updated) {
      this.logger.warn(`Outbox event ${event.id} failure was ignored after its lease was lost.`);
    }
  }

  private retryDelay(attemptNumber: number): number {
    return RETRY_DELAYS_MS[Math.min(attemptNumber - 1, RETRY_DELAYS_MS.length - 1)];
  }
}

function boundedInteger(
  config: ConfigService,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const configured = config.get<string | number>(name);

  if (configured === undefined || configured === null || configured === '') {
    return fallback;
  }

  const value = Number(configured);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }

  return value;
}

function positiveInteger(config: ConfigService, name: string, fallback: number): number {
  const configured = Number(config.get<string | number>(name));
  return Number.isInteger(configured) && configured > 0 ? configured : fallback;
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown publication failure.';
  return message.replaceAll('\0', '').replace(/\s+/g, ' ').trim().slice(0, 500);
}
