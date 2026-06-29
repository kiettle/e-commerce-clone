import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { InventoryRepositoryPort } from '../../domain/repositories/inventory.repository.port';
import { HandleProductCreatedUseCase } from './handle-product-created.use-case';

describe('HandleProductCreatedUseCase', () => {
  let inventory: jest.Mocked<InventoryRepositoryPort>;
  let useCase: HandleProductCreatedUseCase;

  beforeEach(() => {
    inventory = {
      initializeFromProductCreated: jest.fn(),
      reserveStock: jest.fn(),
      releaseStock: jest.fn(),
    };
    useCase = new HandleProductCreatedUseCase(inventory);
  });

  it('creates initial inventory stock from ProductCreated', async () => {
    await useCase.execute({
      eventId: 'event-1',
      productId: 1n,
      name: 'Running Shoes',
      skus: [
        {
          productSkuId: 10n,
          skuCode: 'SHOE-BLACK-42',
          status: 'AVAILABLE',
          quantity: 100,
        },
      ],
    });

    expect(inventory.initializeFromProductCreated).toHaveBeenCalledWith({
      eventId: 'event-1',
      productId: 1n,
      name: 'Running Shoes',
      skus: [
        {
          productSkuId: 10n,
          skuCode: 'SHOE-BLACK-42',
          status: 'AVAILABLE',
          quantity: 100,
        },
      ],
    });
  });

  it('skips empty SKU lists without calling the repository', async () => {
    await useCase.execute({
      eventId: 'event-1',
      productId: 1n,
      name: 'Running Shoes',
      skus: [],
    });

    expect(inventory.initializeFromProductCreated).not.toHaveBeenCalled();
  });

  it('rejects a missing event id', async () => {
    await expect(
      useCase.execute({
        eventId: ' ',
        productId: 1n,
        name: 'Running Shoes',
        skus: [],
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
  });

  it('rejects a negative initial quantity', async () => {
    await expect(
      useCase.execute({
        eventId: 'event-1',
        productId: 1n,
        name: 'Running Shoes',
        skus: [
          {
            productSkuId: 10n,
            skuCode: 'SHOE-BLACK-42',
            status: 'AVAILABLE',
            quantity: -1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(InvalidStockOperationError);
  });
});
