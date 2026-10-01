import { join } from 'node:path';
import { loadSync } from 'protobufjs';
import { describe, expect, it } from 'vitest';

describe('product protobuf contract', () => {
  const root = loadSync(join(process.cwd(), 'libs/proto/product.proto'));

  it('exposes catalog, flash-sale, and SKU-snapshot operations', () => {
    const service = root.lookupService('product.ProductService');

    expect(Object.keys(service.methods).sort()).toEqual([
      'CancelFlashSale',
      'CreateCategory',
      'CreateFlashSale',
      'CreateProduct',
      'DeleteProduct',
      'GetFlashSale',
      'GetProductSkuSnapshot',
      'ListCategories',
      'ListFlashSales',
      'ScheduleFlashSale',
      'SearchProducts',
      'UpdateFlashSale',
      'UpdateProduct',
    ]);
  });

  it('keeps optional search and update fields presence-aware', () => {
    const search = root.lookupType('product.SearchProductsRequest');
    const update = root.lookupType('product.UpdateProductRequest');

    expect(search.fields.name.optional).toBe(true);
    expect(search.fields.categoryId.optional).toBe(true);
    expect(update.fields.name.optional).toBe(true);
    expect(update.fields.description.optional).toBe(true);
    expect(update.fields.imageUrl.optional).toBe(true);
    expect(update.fields.categoryId.optional).toBe(true);
    expect(update.fields.status.optional).toBe(true);
  });

  it('preserves the complete effective-price snapshot', () => {
    const snapshot = root.lookupType('product.ProductSkuSnapshotResponse');

    expect(
      Object.fromEntries(Object.entries(snapshot.fields).map(([name, field]) => [name, field.id])),
    ).toEqual({
      productId: 1,
      productName: 2,
      imageUrl: 3,
      productSkuId: 4,
      skuCode: 5,
      regularPrice: 6,
      effectivePrice: 7,
      priceSource: 8,
      flashSaleId: 9,
      flashSaleItemId: 10,
      saleEndsAt: 11,
      maxQuantityPerUser: 12,
    });
  });
});
