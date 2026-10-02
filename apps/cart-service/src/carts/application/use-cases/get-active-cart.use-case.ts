import { CartEntity } from '../../domain/entities/cart.entity';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';

export class GetActiveCartUseCase {
  constructor(private readonly carts: CartRepositoryPort) {}

  async execute(userId: bigint): Promise<CartEntity> {
    assertPositiveId(userId, 'Cart userId must be greater than zero.');

    return this.carts.getOrCreateActiveCart(userId);
  }
}

export function assertPositiveId(value: bigint, message: string): void {
  if (value <= 0n) {
    throw new InvalidCartOperationError(message);
  }
}
