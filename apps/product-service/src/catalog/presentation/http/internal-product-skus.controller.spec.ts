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
        flashSaleId: 50n,
        flashSaleItemId: 501n,
        saleEndsAt: new Date('2026-10-01T10:00:00.000Z'),
        maxPerUserQuantity: 1,
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
      flashSaleId: '50',
      flashSaleItemId: '501',
      saleEndsAt: '2026-10-01T10:00:00.000Z',
      maxPerUserQuantity: 1,
    });
    expect(response).not.toHaveProperty('availableQuantity');
    expect(response).not.toHaveProperty('quantity');
  });
});
