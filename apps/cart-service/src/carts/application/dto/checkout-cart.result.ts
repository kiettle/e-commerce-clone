import { CartEntity } from '../../domain/entities/cart.entity';

export interface CompletedCheckoutResult {
  outcome: 'COMPLETED';
  checkoutId: string;
  status: 'COMPLETED';
  cart: CartEntity;
  orderId: bigint;
}

export interface PendingCheckoutResult {
  outcome: 'PENDING';
  checkoutId: string;
  status: 'RECONCILIATION_REQUIRED';
}

export type CheckoutCartResult =
  | CompletedCheckoutResult
  | PendingCheckoutResult;
