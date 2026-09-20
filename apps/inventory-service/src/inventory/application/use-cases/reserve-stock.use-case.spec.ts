import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { ReserveStockUseCase } from './reserve-stock.use-case';

describe('ReserveStockUseCase', () => {
  const operationIdentity = {
    cartId: 55n,
    checkoutId: '550e8400-e29b-41d4-a716-446655440000',
    userId: 10n,
  };

  let inventory: Mocked<InventoryRepositoryPort>;
  let useCase: ReserveStockUseCase;

  beforeEach(() => {
    inventory = {
      initializeFromProductCreated: vi.fn(),
      reserveStock: vi.fn(),
      commitStock: vi.fn(),
      releaseStock: vi.fn(),
    };
    useCase = new ReserveStockUseCase(inventory);
  });

  it('rejects an empty reservation without calling the repository', async () => {
    await expect(useCase.execute({ ...operationIdentity, items: [] })).rejects.toBeInstanceOf(
      InvalidStockOperationError,
    );
    expect(inventory.reserveStock).not.toHaveBeenCalled();
  });

  it('normalizes duplicate SKUs before calling the repository', async () => {
    await useCase.execute({
      ...operationIdentity,
      items: [
        { productSkuId: 101n, quantity: 2 },
        { productSkuId: 102n, quantity: 1 },
        { productSkuId: 101n, quantity: 3 },
      ],
    });

    expect(inventory.reserveStock).toHaveBeenCalledTimes(1);
    expect(inventory.reserveStock).toHaveBeenCalledWith(55n, [
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
    ]);
  });

  it('preserves complete flash sale context', async () => {
    await useCase.execute({
      ...operationIdentity,
      items: [
        {
          productSkuId: 101n,
          quantity: 2,
          flashSaleId: 201n,
          flashSaleItemId: 301n,
        },
      ],
    });

    expect(inventory.reserveStock).toHaveBeenCalledWith(55n, [
      {
        productSkuId: 101n,
        quantity: 2,
        flashSaleId: 201n,
        flashSaleItemId: 301n,
      },
    ]);
  });

  it.each([{ flashSaleId: 201n }, { flashSaleItemId: 301n }])(
    'rejects partial flash sale context',
    async (saleContext) => {
      await expect(
        useCase.execute({
          ...operationIdentity,
          items: [{ productSkuId: 101n, quantity: 1, ...saleContext }],
        }),
      ).rejects.toBeInstanceOf(InvalidStockOperationError);
      expect(inventory.reserveStock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { checkoutId: '', userId: 10n },
    { checkoutId: operationIdentity.checkoutId, userId: 0n },
  ])('rejects missing reservation identity', async (identity) => {
    await expect(
      useCase.execute({
        cartId: 55n,
        ...identity,
        items: [{ productSkuId: 101n, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
    expect(inventory.reserveStock).not.toHaveBeenCalled();
  });

  it.each([0, -1])(
    'rejects a non-positive quantity of %s without calling the repository',
    async (quantity) => {
      await expect(
        useCase.execute({
          ...operationIdentity,
          items: [{ productSkuId: 101n, quantity }],
        }),
      ).rejects.toBeInstanceOf(InvalidStockOperationError);
      expect(inventory.reserveStock).not.toHaveBeenCalled();
    },
  );
});
