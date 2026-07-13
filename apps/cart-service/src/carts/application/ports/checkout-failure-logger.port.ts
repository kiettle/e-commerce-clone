export const CHECKOUT_FAILURE_LOGGER = Symbol('CHECKOUT_FAILURE_LOGGER');

export interface CheckoutFailureLoggerPort {
  logInventoryReleaseFailure(cartId: bigint, error: unknown): void;
}
