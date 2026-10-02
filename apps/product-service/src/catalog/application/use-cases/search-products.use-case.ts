import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductRepositoryPort } from '../../domain/repositories/product.repository.port';
import { SearchProductsQuery } from '../dto/search-products.query';

export class SearchProductsUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  execute(query: SearchProductsQuery): Promise<ProductEntity[]> {
    return this.products.search(query);
  }
}
