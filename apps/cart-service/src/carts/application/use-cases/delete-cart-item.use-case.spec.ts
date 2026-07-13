import { CartEntity } from '../../domain/entities/cart.entity';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { DeleteCartItemUseCase } from './delete-cart-item.use-case';

describe('DeleteCartItemUseCase', () => {
  it('deletes cart item for user', async () => {
    const carts = {
      getOrCreateActiveCart: jest.fn(),
      findById: jest.fn(),
      addOrIncrementItem: jest.fn(),
      updateItemQuantity: jest.fn(),
      deleteItem: jest.fn().mockResolvedValue(
        new CartEntity({
          id: 1n,
          userId: 7n,
          status: CartStatus.Active,
        }),
      ),
      markCheckedOut: jest.fn(),
    } satisfies jest.Mocked<CartRepositoryPort>;
    const useCase = new DeleteCartItemUseCase(carts);

    await useCase.execute({
      userId: 7n,
      cartItemId: 9n,
    });

    expect(carts.deleteItem).toHaveBeenCalledWith(7n, 9n);
  });
});
