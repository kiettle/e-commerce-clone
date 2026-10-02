import { Injectable, Logger } from '@nestjs/common';
import { CheckoutFailureLoggerPort } from '../../application/ports/checkout-failure-logger.port';

@Injectable()
export class NestCheckoutFailureLogger implements CheckoutFailureLoggerPort {
  private readonly logger = new Logger(NestCheckoutFailureLogger.name);

  logInventoryReleaseFailure(cartId: bigint, error: unknown): void {
    const details = error instanceof Error ? error.stack ?? error.message : String(error);

    this.logger.error(
      `Failed to release reserved stock for cart ${cartId.toString()}. Manual repair may be required.`,
      details,
    );
  }
}
