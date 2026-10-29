import { describe, expect, it, vi } from 'vitest';
import { ProductRepositoryPort } from '../../domain/repositories/product.repository.port';
import { ProductSearchCachePort } from '../ports/product-search-cache.port';
import { SearchProductsUseCase } from './search-products.use-case';

function setup() {
  const products: ProductRepositoryPort = {
    search: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
  const cache: ProductSearchCachePort = {
    get: vi.fn().mockResolvedValue({ status: 'miss' }),
    set: vi.fn().mockResolvedValue(undefined),
  };
  return { products, cache, useCase: new SearchProductsUseCase(products, cache) };
}

describe('SearchProductsUseCase', () => {
  it('queries PostgreSQL on a miss and caches even empty results', async () => {
    const { products, cache, useCase } = setup();
    const query = { name: 'Keyboard', categoryId: 2n };
    await expect(useCase.execute(query)).resolves.toEqual([]);
    expect(products.search).toHaveBeenCalledWith(query);
    expect(cache.set).toHaveBeenCalledWith(query, []);
  });

  it('returns an empty cache hit without querying or refreshing its TTL', async () => {
    const { products, cache, useCase } = setup();
    vi.mocked(cache.get).mockResolvedValue({ status: 'hit', products: [] });
    await expect(useCase.execute({})).resolves.toEqual([]);
    expect(products.search).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('skips population after a failed cache lookup', async () => {
    const { products, cache, useCase } = setup();
    vi.mocked(cache.get).mockResolvedValue({ status: 'unavailable' });
    await expect(useCase.execute({})).resolves.toEqual([]);
    expect(products.search).toHaveBeenCalledOnce();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('propagates database errors without caching them', async () => {
    const { products, cache, useCase } = setup();
    const error = new Error('Database unavailable');
    vi.mocked(products.search).mockRejectedValue(error);
    await expect(useCase.execute({})).rejects.toBe(error);
    expect(cache.set).not.toHaveBeenCalled();
  });
});
