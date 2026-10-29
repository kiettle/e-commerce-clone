import { describe, expect, it } from 'vitest';
import {
  decodeProducts,
  encodeProducts,
  productSearchCacheKey,
} from './product-search-cache.codec';
import { cachedProduct } from './support/product-cache.fixture';

describe('product search cache codec', () => {
  it('round-trips domain entities, large IDs, dates, nullable fields, and SKU prices', () => {
    const products = [cachedProduct()];
    expect(decodeProducts(encodeProducts(products))).toStrictEqual(products);
    expect(decodeProducts('[]')).toEqual([]);
  });

  it('uses deterministic bounded keys without changing name semantics', () => {
    expect(productSearchCacheKey({})).toBe(productSearchCacheKey({ name: '' }));
    expect(productSearchCacheKey({ name: 'Key', categoryId: 1n })).toBe(
      productSearchCacheKey({ categoryId: 1n, name: 'Key' }),
    );
    const keys = [
      {},
      { name: 'Key' },
      { name: 'key' },
      { name: ' Key ' },
      { name: 'Key', categoryId: 1n },
      { name: 'Key', categoryId: 2n },
    ].map(productSearchCacheKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[1]).toMatch(/^product-service:catalog-search:v1:[a-f0-9]{64}$/);
  });

  it.each(['bad JSON', '{}', '[null]', '[{}]'])('rejects malformed entries: %s', (payload) => {
    expect(() => decodeProducts(payload)).toThrow();
  });

  it.each([
    { id: 9007199254740992 },
    { id: '-1' },
    { name: null },
    { status: 'UNKNOWN' },
    { createdAt: 'yesterday' },
    { imageUrl: 123 },
    { skus: [{}] },
  ])('rejects incompatible product fields: %j', (changes) => {
    const product = JSON.parse(encodeProducts([cachedProduct()]))[0];
    expect(() => decodeProducts(JSON.stringify([{ ...product, ...changes }]))).toThrow();
  });

  it.each([{ price: '19.95' }, { price: -1 }, { status: 'UNKNOWN' }, { productId: null }])(
    'rejects incompatible SKU fields: %j',
    (changes) => {
      const product = JSON.parse(encodeProducts([cachedProduct()]))[0];
      product.skus[0] = { ...product.skus[0], ...changes };
      expect(() => decodeProducts(JSON.stringify([product]))).toThrow();
    },
  );
});
