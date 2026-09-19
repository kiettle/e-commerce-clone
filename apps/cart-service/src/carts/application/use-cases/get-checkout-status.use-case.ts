import { CheckoutAttemptEntity } from '../../domain/entities/checkout-attempt.entity';
import { CheckoutNotFoundError } from '../../domain/errors/checkout-not-found.error';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { CheckoutAttemptRepositoryPort } from '../../domain/repositories/checkout-attempt.repository.port';
import { assertPositiveId } from './get-active-cart.use-case';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class GetCheckoutStatusUseCase {
  constructor(private readonly attempts: CheckoutAttemptRepositoryPort) {}

  async execute(
    userId: bigint,
    checkoutId: string,
  ): Promise<CheckoutAttemptEntity> {
    assertPositiveId(userId, 'Checkout userId must be greater than zero.');

    if (!UUID_V4_PATTERN.test(checkoutId)) {
      throw new InvalidCartOperationError(
        'Checkout ID must be a valid UUID v4.',
      );
    }

    const attempt = await this.attempts.findById(checkoutId);

    if (!attempt || attempt.userId !== userId) {
      throw new CheckoutNotFoundError(checkoutId);
    }

    return attempt;
  }
}
