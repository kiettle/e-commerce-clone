import { describe, expect, it, vi } from 'vitest';
import { ProductSkuSnapshotRepositoryPort } from '../ports/product-sku-snapshot.repository.port';
import {
  GetProductSkuSnapshotUseCase,
  ProductPriceSource,
} from './get-product-sku-snapshot.use-case';

describe('GetProductSkuSnapshotUseCase', () => {
  it.each([
    [null, 100, ProductPriceSource.Regular],
    [75, 75, ProductPriceSource.FlashSale],
  ])('selects one effective price source', async (activeSalePrice, effectivePrice, priceSource) => {
    const repository = {
      findEffectiveSnapshot: vi.fn().mockResolvedValue({
        productId: 10n,
        productName: 'Keyboard',
        imageUrl: null,
        productSkuId: 101n,
        skuCode: 'KB-BLACK',
        regularPrice: 100,
        activeSalePrice,
        flashSaleId: activeSalePrice === null ? null : 50n,
        flashSaleItemId: activeSalePrice === null ? null : 501n,
      }),
    } as ProductSkuSnapshotRepositoryPort;

    await expect(new GetProductSkuSnapshotUseCase(repository).execute(101n)).resolves.toMatchObject(
      {
        effectivePrice,
        priceSource,
      },
    );
  });
});
