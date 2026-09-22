import { CartEntity } from '../entities/cart.entity';
import { CheckoutAttemptEntity } from '../entities/checkout-attempt.entity';
import { ReconciliationAction } from '../enums/reconciliation-action.enum';

export const CHECKOUT_ATTEMPT_REPOSITORY = Symbol(
  'CHECKOUT_ATTEMPT_REPOSITORY',
);

export interface ClaimCheckoutAttemptsRequest {
  limit: number;
  leaseOwner: string;
  leaseUntil: Date;
  maxAttempts: number;
  now: Date;
}

export interface CheckoutAttemptRepositoryPort {
  findById(checkoutId: string): Promise<CheckoutAttemptEntity | null>;
  findByUserAndKey(
    userId: bigint,
    idempotencyKey: string,
  ): Promise<CheckoutAttemptEntity | null>;
  claimDue(request: ClaimCheckoutAttemptsRequest): Promise<CheckoutAttemptEntity[]>;
  finishClaim(
    attemptId: string,
    leaseOwner: string,
    nextRetryAt: Date | null,
  ): Promise<boolean>;
  markClaimFailed(
    attemptId: string,
    leaseOwner: string,
    error: string,
    nextRetryAt: Date | null,
  ): Promise<boolean>;
  startOrLoad(
    userId: bigint,
    cartId: bigint,
    idempotencyKey: string,
  ): Promise<CheckoutAttemptEntity>;
  markStockReserved(attemptId: string): Promise<CheckoutAttemptEntity>;
  markOrderConfirmed(
    attemptId: string,
    orderId: bigint,
  ): Promise<CheckoutAttemptEntity>;
  markStockCommitted(attemptId: string): Promise<CheckoutAttemptEntity>;
  markCompensating(
    attemptId: string,
    error: string,
  ): Promise<CheckoutAttemptEntity>;
  markReconciliationRequired(
    attemptId: string,
    action: ReconciliationAction,
    error: string,
  ): Promise<void>;
  complete(attemptId: string, orderId: bigint): Promise<CartEntity>;
  failAndAbandon(attemptId: string, error: string): Promise<void>;
}
