import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { ProductRepositoryPort } from '../../domain/repositories/product.repository.port';

export class DeleteProductUseCase {
  constructor(private readonly products: ProductRepositoryPort) {}

  async execute(productId: bigint): Promise<ProductEntity> {
    const product = await this.products.findById(productId);

    if (!product) {
      throw new ProductNotFoundError(productId);
    }

    return this.products.softDelete(productId);
  }
}
