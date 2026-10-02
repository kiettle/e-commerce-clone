import { CartEntity } from '../../domain/entities/cart.entity';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { UpdateCartItemCommand } from '../dto/update-cart-item.command';
import { assertPositiveId } from './get-active-cart.use-case';

export class UpdateCartItemUseCase {
  constructor(private readonly carts: CartRepositoryPort) {}

  async execute(command: UpdateCartItemCommand): Promise<CartEntity> {
    assertPositiveId(command.userId, 'Cart userId must be greater than zero.');
    assertPositiveId(
      command.cartItemId,
      'Cart item ID must be greater than zero.',
    );

    if (!Number.isInteger(command.quantity) || command.quantity < 0) {
      throw new InvalidCartOperationError(
        'Cart item quantity must be zero or greater.',
      );
    }

    return this.carts.updateItemQuantity(
      command.userId,
      command.cartItemId,
      command.quantity,
    );
  }
}
