import { InvalidOrderError } from '../../domain/errors/invalid-order.error';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/;

export function assertValidCheckoutId(checkoutId: string): void {
  if (!UUID_PATTERN.test(checkoutId)) {
    throw new InvalidOrderError('Order checkoutId must be a valid UUID.');
  }
}

export function assertValidRequestHash(requestHash: string): void {
  if (!SHA_256_PATTERN.test(requestHash)) {
    throw new InvalidOrderError(
      'Order requestHash must be a lowercase SHA-256 hash.',
    );
  }
}
