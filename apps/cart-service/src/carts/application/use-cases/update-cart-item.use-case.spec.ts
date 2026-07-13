import { CartEntity } from '../../domain/entities/cart.entity';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { UpdateCartItemUseCase } from './update-cart-item.use-case';

describe('UpdateCartItemUseCase', () => {
  let carts: jest.Mocked<CartRepositoryPort>;
  let useCase: UpdateCartItemUseCase;

  beforeEach(() => {
    carts = {
      getOrCreateActiveCart: jest.fn(),
      findById: jest.fn(),
      addOrIncrementItem: jest.fn(),
      updateItemQuantity: jest.fn().mockResolvedValue(
        new CartEntity({
          id: 1n,
          userId: 7n,
          status: CartStatus.Active,
        }),
      ),
      deleteItem: jest.fn(),
      markCheckedOut: jest.fn(),
    };
    useCase = new UpdateCartItemUseCase(carts);
  });

  it('updates cart item quantity', async () => {
    await useCase.execute({
      userId: 7n,
      cartItemId: 9n,
      quantity: 3,
    });

    expect(carts.updateItemQuantity).toHaveBeenCalledWith(7n, 9n, 3);
  });

  it('allows zero quantity so repository can remove item', async () => {
    await useCase.execute({
      userId: 7n,
      cartItemId: 9n,
      quantity: 0,
    });

    expect(carts.updateItemQuantity).toHaveBeenCalledWith(7n, 9n, 0);
  });

  it('rejects negative quantity', async () => {
    await expect(
      useCase.execute({
        userId: 7n,
        cartItemId: 9n,
        quantity: -1,
      }),
    ).rejects.toBeInstanceOf(InvalidCartOperationError);
  });
});
