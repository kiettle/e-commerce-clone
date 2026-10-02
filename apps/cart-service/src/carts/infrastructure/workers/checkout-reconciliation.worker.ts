import { Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { CheckoutCartUseCase } from '../../application/use-cases/checkout-cart.use-case';
import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CheckoutTerminalError } from '../../domain/errors/checkout-terminal.error';
import { CheckoutAttemptRepositoryPort } from '../../domain/repositories/checkout-attempt.repository.port';

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];

export class CheckoutReconciliationWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutReconciliationWorker.name);
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
    private readonly attempts: CheckoutAttemptRepositoryPort,
    private readonly checkout: CheckoutCartUseCase,
    config: ConfigService,
  ) {
    this.pollIntervalMs = boundedInteger(
      config,
      'CHECKOUT_RECONCILIATION_POLL_INTERVAL_MS',
      2_000,
      250,
      60_000,
    );
    this.batchSize = boundedInteger(config, 'CHECKOUT_RECONCILIATION_BATCH_SIZE', 20, 1, 100);
    this.leaseDurationMs = boundedInteger(
      config,
      'CHECKOUT_RECONCILIATION_LEASE_MS',
      30_000,
      5_000,
      300_000,
    );
    this.shutdownTimeoutMs = positiveInteger(
      config,
      'CHECKOUT_RECONCILIATION_SHUTDOWN_TIMEOUT_MS',
      10_000,
    );
    this.maxAttempts = boundedInteger(config, 'CHECKOUT_RECONCILIATION_MAX_ATTEMPTS', 5, 1, 20);
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

    if (!this.currentPass) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      this.currentPass,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, this.shutdownTimeoutMs);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
  }

  private scheduleNextPass(delayMs: number): void {
    if (this.stopping) return;

    this.timer = setTimeout(() => {
      this.timer = undefined;
      const pass = this.runPass();
      this.currentPass = pass;
      void pass.then(
        () => this.finishPass(pass),
        (error: unknown) => {
          this.logger.warn(`Checkout reconciliation polling failed: ${safeErrorMessage(error)}`);
          this.finishPass(pass);
        },
      );
    }, delayMs);
  }

  private finishPass(pass: Promise<void>): void {
    if (this.currentPass === pass) this.currentPass = undefined;
    this.scheduleNextPass(this.pollIntervalMs);
  }

  private async runPass(): Promise<void> {
    if (this.stopping || !this.workerId) return;

    const now = new Date();
    const claimed = await this.attempts.claimDue({
      limit: this.batchSize,
      leaseOwner: this.workerId,
      leaseUntil: new Date(now.getTime() + this.leaseDurationMs),
      maxAttempts: this.maxAttempts,
      now,
    });

    for (const attempt of claimed) {
      if (this.stopping) break;
      await this.resume(attempt);
    }
  }

  private async resume(attempt: CheckoutAttemptEntity): Promise<void> {
    const leaseOwner = attempt.leaseOwner;
    if (!leaseOwner) return;

    try {
      const result = await this.checkout.resumeAttempt(attempt);
      if (result.outcome === 'PENDING') {
        const attemptNumber = attempt.retryCount + 1;
        const nextRetryAt =
          attemptNumber >= this.maxAttempts
            ? null
            : new Date(Date.now() + retryDelay(attemptNumber));
        const updated = await this.attempts.finishClaim(attempt.id, leaseOwner, nextRetryAt);
        if (!updated) {
          this.logger.warn(`Checkout ${attempt.id} retry schedule was ignored after lease loss.`);
        }
      } else {
        await this.attempts.finishClaim(attempt.id, leaseOwner, null);
      }
    } catch (error) {
      if (error instanceof CheckoutTerminalError) {
        await this.attempts.finishClaim(attempt.id, leaseOwner, null);
        return;
      }

      const attemptNumber = attempt.retryCount + 1;
      const nextRetryAt =
        attemptNumber >= this.maxAttempts ? null : new Date(Date.now() + retryDelay(attemptNumber));
      const updated = await this.attempts.markClaimFailed(
        attempt.id,
        leaseOwner,
        safeErrorMessage(error),
        nextRetryAt,
      );
      if (!updated) {
        this.logger.warn(`Checkout ${attempt.id} failure was ignored after lease loss.`);
      }
    }
  }
}

function retryDelay(attemptNumber: number): number {
  return RETRY_DELAYS_MS[Math.min(attemptNumber - 1, RETRY_DELAYS_MS.length - 1)];
}

function boundedInteger(
  config: ConfigService,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const configured = config.get<string | number>(name);
  if (configured === undefined || configured === null || configured === '') return fallback;

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
  const message = error instanceof Error ? error.message : 'Unknown checkout recovery failure.';
  return message.replaceAll('\0', '').replace(/\s+/g, ' ').trim().slice(0, 500);
}
