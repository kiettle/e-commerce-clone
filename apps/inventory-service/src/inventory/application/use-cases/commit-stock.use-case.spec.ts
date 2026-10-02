import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { CommitStockUseCase } from './commit-stock.use-case';

describe('CommitStockUseCase', () => {
  const operationIdentity = {
    cartId: 55n,
    checkoutId: '550e8400-e29b-41d4-a716-446655440000',
    userId: 10n,
  };

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
    await expect(useCase.execute({ ...operationIdentity, items: [] })).rejects.toBeInstanceOf(
      InvalidStockOperationError,
    );
    expect(inventory.commitStock).not.toHaveBeenCalled();
  });

  it('normalizes duplicate SKUs before committing', async () => {
    await useCase.execute({
      ...operationIdentity,
      items: [
        { productSkuId: 101n, quantity: 2 },
        { productSkuId: 102n, quantity: 1 },
        { productSkuId: 101n, quantity: 3 },
      ],
    });

    expect(inventory.commitStock).toHaveBeenCalledWith({
      ...operationIdentity,
      items: [
        {
          productSkuId: 101n,
          quantity: 5,
          flashSaleId: null,
          flashSaleItemId: null,
        },
        {
          productSkuId: 102n,
          quantity: 1,
          flashSaleId: null,
          flashSaleItemId: null,
        },
      ],
    });
  });

  it('preserves sale context when committing a reservation', async () => {
    await useCase.execute({
      ...operationIdentity,
      items: [
        {
          productSkuId: 101n,
          quantity: 1,
          flashSaleId: 201n,
          flashSaleItemId: 301n,
        },
      ],
    });

    expect(inventory.commitStock).toHaveBeenCalledWith({
      ...operationIdentity,
      items: [
        {
          productSkuId: 101n,
          quantity: 1,
          flashSaleId: 201n,
          flashSaleItemId: 301n,
        },
      ],
    });
  });

  it.each([0, -1])('rejects a non-positive quantity of %s', async (quantity) => {
    await expect(
      useCase.execute({
        ...operationIdentity,
        items: [{ productSkuId: 101n, quantity }],
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
    expect(inventory.commitStock).not.toHaveBeenCalled();
  });
});
