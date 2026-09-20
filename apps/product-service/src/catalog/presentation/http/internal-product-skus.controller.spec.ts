import { describe, expect, it, vi } from 'vitest';
import { GetProductSkuSnapshotUseCase } from '../../application/use-cases/get-product-sku-snapshot.use-case';
import { InternalProductSkusController } from './internal-product-skus.controller';

describe('InternalProductSkusController', () => {
  it('returns pricing metadata without inventory quantities', async () => {
    const getSnapshot = {
      execute: vi.fn().mockResolvedValue({
        productId: 10n,
        productName: 'Keyboard',
        imageUrl: null,
        productSkuId: 101n,
        skuCode: 'KB-BLACK',
        regularPrice: 100,
        effectivePrice: 75,
        priceSource: 'FLASH_SALE',
      }),
    } as unknown as GetProductSkuSnapshotUseCase;
    const controller = new InternalProductSkusController(getSnapshot);

    const response = await controller.get('101');

    expect(getSnapshot.execute).toHaveBeenCalledWith(101n);
    expect(response).toEqual({
      productId: '10',
      productName: 'Keyboard',
      imageUrl: null,
      productSkuId: '101',
      skuCode: 'KB-BLACK',
      regularPrice: 100,
      effectivePrice: 75,
      priceSource: 'FLASH_SALE',
    });
    expect(response).not.toHaveProperty('availableQuantity');
    expect(response).not.toHaveProperty('quantity');
  });
});
