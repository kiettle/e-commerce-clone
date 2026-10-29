import { ProductEntity } from '../../domain/entities/product.entity';
import { SearchProductsQuery } from '../dto/search-products.query';

export const PRODUCT_SEARCH_CACHE = Symbol('PRODUCT_SEARCH_CACHE');

export type ProductSearchCacheResult =
  | { status: 'hit'; products: ProductEntity[] }
  | { status: 'miss' | 'unavailable' };

export interface ProductSearchCachePort {
  // Adapters absorb infrastructure failures. Only a miss permits population.
  get(query: SearchProductsQuery): Promise<ProductSearchCacheResult>;
  set(query: SearchProductsQuery, products: ProductEntity[]): Promise<void>;
}
