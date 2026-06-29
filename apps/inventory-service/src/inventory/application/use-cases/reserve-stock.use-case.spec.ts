import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';
import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { StockNotFoundError } from '../../domain/errors/stock-not-found.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { ReserveStockUseCase } from './reserve-stock.use-case';

describe('ReserveStockUseCase', () => {
  let inventory: jest.Mocked<InventoryRepositoryPort>;
  let useCase: ReserveStockUseCase;

  beforeEach(() => {
    inventory = {
      initializeFromProductCreated: jest.fn(),
      reserveStock: jest.fn(),
      releaseStock: jest.fn(),
    };
    useCase = new ReserveStockUseCase(inventory);
  });

  it('reserves stock successfully', async () => {
    await useCase.execute({
      cartId: 7n,
      items: [{ productSkuId: 10n, quantity: 2 }],
    });

    expect(inventory.reserveStock).toHaveBeenCalledWith(7n, [
      { productSkuId: 10n, quantity: 2 },
    ]);
  });

  it('aggregates duplicate SKU IDs before reserving', async () => {
    await useCase.execute({
      cartId: 7n,
      items: [
        { productSkuId: 10n, quantity: 2 },
        { productSkuId: 10n, quantity: 3 },
      ],
    });

    expect(inventory.reserveStock).toHaveBeenCalledWith(7n, [
      { productSkuId: 10n, quantity: 5 },
    ]);
  });

  it('rejects empty items', async () => {
    await expect(
      useCase.execute({
        cartId: 7n,
        items: [],
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
  });

  it('rejects non-positive quantities', async () => {
    await expect(
      useCase.execute({
        cartId: 7n,
        items: [{ productSkuId: 10n, quantity: 0 }],
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
  });

  it('forwards missing stock failures', async () => {
    inventory.reserveStock.mockRejectedValueOnce(new StockNotFoundError(10n));

    await expect(
      useCase.execute({
        cartId: 7n,
        items: [{ productSkuId: 10n, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(StockNotFoundError);
  });

  it('forwards insufficient stock failures', async () => {
    inventory.reserveStock.mockRejectedValueOnce(new InsufficientStockError(10n));

    await expect(
      useCase.execute({
        cartId: 7n,
        items: [{ productSkuId: 10n, quantity: 99 }],
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });
});
