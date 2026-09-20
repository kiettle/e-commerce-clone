import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { CommitStockUseCase } from './commit-stock.use-case';

describe('CommitStockUseCase', () => {
  let inventory: Mocked<InventoryRepositoryPort>;
  let useCase: CommitStockUseCase;

  beforeEach(() => {
    inventory = {
      initializeFromProductCreated: vi.fn(),
      reserveStock: vi.fn(),
      commitStock: vi.fn(),
      releaseStock: vi.fn(),
    };
    useCase = new CommitStockUseCase(inventory);
  });

  it('rejects an empty operation', async () => {
    await expect(
      useCase.execute({ cartId: 55n, items: [] }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
    expect(inventory.commitStock).not.toHaveBeenCalled();
  });

  it('normalizes duplicate SKUs before committing', async () => {
    await useCase.execute({
      cartId: 55n,
      items: [
        { productSkuId: 101n, quantity: 2 },
        { productSkuId: 102n, quantity: 1 },
        { productSkuId: 101n, quantity: 3 },
      ],
    });

    expect(inventory.commitStock).toHaveBeenCalledWith(55n, [
      { productSkuId: 101n, quantity: 5 },
      { productSkuId: 102n, quantity: 1 },
    ]);
  });

  it.each([0, -1])(
    'rejects a non-positive quantity of %s',
    async (quantity) => {
      await expect(
        useCase.execute({
          cartId: 55n,
          items: [{ productSkuId: 101n, quantity }],
        }),
      ).rejects.toBeInstanceOf(InvalidStockOperationError);
      expect(inventory.commitStock).not.toHaveBeenCalled();
    },
  );
});
