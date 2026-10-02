import { CartEntity } from '../../domain/entities/cart.entity';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { DeleteCartItemCommand } from '../dto/delete-cart-item.command';
import { assertPositiveId } from './get-active-cart.use-case';

export class DeleteCartItemUseCase {
  constructor(private readonly carts: CartRepositoryPort) {}

  async execute(command: DeleteCartItemCommand): Promise<CartEntity> {
    assertPositiveId(command.userId, 'Cart userId must be greater than zero.');
    assertPositiveId(
      command.cartItemId,
      'Cart item ID must be greater than zero.',
    );

    return this.carts.deleteItem(command.userId, command.cartItemId);
  }
}
