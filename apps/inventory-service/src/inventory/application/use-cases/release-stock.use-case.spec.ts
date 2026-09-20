import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { ReleaseStockUseCase } from './release-stock.use-case';

describe('ReleaseStockUseCase', () => {
  let inventory: Mocked<InventoryRepositoryPort>;
  let useCase: ReleaseStockUseCase;

  beforeEach(() => {
    inventory = {
      initializeFromProductCreated: vi.fn(),
      reserveStock: vi.fn(),
      commitStock: vi.fn(),
      releaseStock: vi.fn(),
    };
    useCase = new ReleaseStockUseCase(inventory);
  });

  it('rejects an empty release without calling the repository', async () => {
    await expect(useCase.execute({ cartId: 55n, items: [] })).rejects.toBeInstanceOf(
      InvalidStockOperationError,
    );
    expect(inventory.releaseStock).not.toHaveBeenCalled();
  });

  it('normalizes duplicate SKUs before calling the repository', async () => {
    await useCase.execute({
      cartId: 55n,
      items: [
        { productSkuId: 101n, quantity: 2 },
        { productSkuId: 102n, quantity: 1 },
        { productSkuId: 101n, quantity: 3 },
      ],
    });

    expect(inventory.releaseStock).toHaveBeenCalledTimes(1);
    expect(inventory.releaseStock).toHaveBeenCalledWith(55n, [
      { productSkuId: 101n, quantity: 5 },
      { productSkuId: 102n, quantity: 1 },
    ]);
  });

  it.each([0, -1])(
    'rejects a non-positive quantity of %s without calling the repository',
    async (quantity) => {
      await expect(
        useCase.execute({
          cartId: 55n,
          items: [{ productSkuId: 101n, quantity }],
        }),
      ).rejects.toBeInstanceOf(InvalidStockOperationError);
      expect(inventory.releaseStock).not.toHaveBeenCalled();
    },
  );
});
