import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductRepositoryPort } from '../../domain/repositories/product.repository.port';
import { SearchProductsQuery } from '../dto/search-products.query';
import { ProductSearchCachePort } from '../ports/product-search-cache.port';

export class SearchProductsUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly cache: ProductSearchCachePort,
  ) {}

  async execute(query: SearchProductsQuery): Promise<ProductEntity[]> {
    const cached = await this.cache.get(query);
    if (cached.status === 'hit') {
      return cached.products;
    }

    const products = await this.products.search(query);
    if (cached.status === 'miss') {
      await this.cache.set(query, products);
    }
    return products;
  }
}
