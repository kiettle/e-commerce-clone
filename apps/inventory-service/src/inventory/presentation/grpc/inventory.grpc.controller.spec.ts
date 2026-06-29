import { InvalidStockOperationError } from '../../domain/errors/invalid-stock-operation.error';
import { ReleaseStockUseCase } from '../../application/use-cases/release-stock.use-case';
import { ReserveStockUseCase } from '../../application/use-cases/reserve-stock.use-case';
import { InventoryGrpcController } from './inventory.grpc.controller';

describe('InventoryGrpcController', () => {
  let reserveStockUseCase: jest.Mocked<ReserveStockUseCase>;
  let releaseStockUseCase: jest.Mocked<ReleaseStockUseCase>;
  let controller: InventoryGrpcController;

  beforeEach(() => {
    reserveStockUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReserveStockUseCase>;
    releaseStockUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReleaseStockUseCase>;
    controller = new InventoryGrpcController(
      reserveStockUseCase,
      releaseStockUseCase,
    );
  });

  it('maps ReserveStock requests to the use case', async () => {
    await expect(
      controller.reserveStock({
        cart_id: '7',
        items: [{ product_sku_id: '10', quantity: 2 }],
      }),
    ).resolves.toEqual({
      success: true,
      message: 'OK',
    });

    expect(reserveStockUseCase.execute).toHaveBeenCalledWith({
      cartId: 7n,
      items: [{ productSkuId: 10n, quantity: 2 }],
    });
  });

  it('maps ReleaseStock requests to the use case', async () => {
    await expect(
      controller.releaseStock({
        cart_id: '7',
        items: [{ product_sku_id: '10', quantity: 2 }],
      }),
    ).resolves.toEqual({
      success: true,
      message: 'OK',
    });

    expect(releaseStockUseCase.execute).toHaveBeenCalledWith({
      cartId: 7n,
      items: [{ productSkuId: 10n, quantity: 2 }],
    });
  });

  it('maps known inventory errors to success false', async () => {
    reserveStockUseCase.execute.mockRejectedValueOnce(
      new InvalidStockOperationError('Stock operation items are required.'),
    );

    await expect(
      controller.reserveStock({
        cart_id: '7',
        items: [],
      }),
    ).resolves.toEqual({
      success: false,
      message: 'Stock operation items are required.',
    });
  });
});
