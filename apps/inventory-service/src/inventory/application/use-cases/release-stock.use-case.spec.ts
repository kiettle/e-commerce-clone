import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { ReservationNotFoundError } from '../../domain/errors/reservation-not-found.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { ReleaseStockUseCase } from './release-stock.use-case';

describe('ReleaseStockUseCase', () => {
  let inventory: jest.Mocked<InventoryRepositoryPort>;
  let useCase: ReleaseStockUseCase;

  beforeEach(() => {
    inventory = {
      initializeFromProductCreated: jest.fn(),
      reserveStock: jest.fn(),
      releaseStock: jest.fn(),
    };
    useCase = new ReleaseStockUseCase(inventory);
  });

  it('releases stock successfully', async () => {
    await useCase.execute({
      cartId: 7n,
      items: [{ productSkuId: 10n, quantity: 2 }],
    });

    expect(inventory.releaseStock).toHaveBeenCalledWith(7n, [
      { productSkuId: 10n, quantity: 2 },
    ]);
  });

  it('aggregates duplicate SKU IDs before releasing', async () => {
    await useCase.execute({
      cartId: 7n,
      items: [
        { productSkuId: 10n, quantity: 1 },
        { productSkuId: 10n, quantity: 2 },
      ],
    });

    expect(inventory.releaseStock).toHaveBeenCalledWith(7n, [
      { productSkuId: 10n, quantity: 3 },
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
        items: [{ productSkuId: 10n, quantity: -1 }],
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
  });

  it('forwards missing reservation failures', async () => {
    inventory.releaseStock.mockRejectedValueOnce(new ReservationNotFoundError(10n));

    await expect(
      useCase.execute({
        cartId: 7n,
        items: [{ productSkuId: 10n, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(ReservationNotFoundError);
  });
});
