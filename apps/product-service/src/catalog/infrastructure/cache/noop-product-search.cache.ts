import {
  ProductSearchCachePort,
  ProductSearchCacheResult,
} from '../../application/ports/product-search-cache.port';

export class NoopProductSearchCache implements ProductSearchCachePort {
  async get(): Promise<ProductSearchCacheResult> {
    return { status: 'unavailable' };
  }

  async set(): Promise<void> {}
}
