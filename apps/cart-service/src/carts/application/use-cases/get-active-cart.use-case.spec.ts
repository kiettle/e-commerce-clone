import { CartEntity } from '../../domain/entities/cart.entity';
import { CartStatus } from '../../domain/enums/cart-status.enum';
import { InvalidCartOperationError } from '../../domain/errors/invalid-cart-operation.error';
import { CartRepositoryPort } from '../../domain/repositories/cart.repository.port';
import { GetActiveCartUseCase } from './get-active-cart.use-case';

describe('GetActiveCartUseCase', () => {
  it('gets or creates active cart for user', async () => {
    const cart = new CartEntity({
      id: 1n,
      userId: 7n,
      status: CartStatus.Active,
    });
    const carts = {
      getOrCreateActiveCart: jest.fn().mockResolvedValue(cart),
      findById: jest.fn(),
      addOrIncrementItem: jest.fn(),
      updateItemQuantity: jest.fn(),
      deleteItem: jest.fn(),
      markCheckedOut: jest.fn(),
    } satisfies jest.Mocked<CartRepositoryPort>;
    const useCase = new GetActiveCartUseCase(carts);

    await expect(useCase.execute(7n)).resolves.toBe(cart);
    expect(carts.getOrCreateActiveCart).toHaveBeenCalledWith(7n);
  });

  it('rejects non-positive user ID', async () => {
    const carts = {
      getOrCreateActiveCart: jest.fn(),
      findById: jest.fn(),
      addOrIncrementItem: jest.fn(),
      updateItemQuantity: jest.fn(),
      deleteItem: jest.fn(),
      markCheckedOut: jest.fn(),
    } satisfies jest.Mocked<CartRepositoryPort>;
    const useCase = new GetActiveCartUseCase(carts);

    await expect(useCase.execute(0n)).rejects.toBeInstanceOf(
      InvalidCartOperationError,
    );
  });
});
