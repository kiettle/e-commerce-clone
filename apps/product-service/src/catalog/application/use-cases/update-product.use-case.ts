import { ProductEntity } from '../../domain/entities/product.entity';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';
import { ProductRepositoryPort } from '../../domain/repositories/product.repository.port';
import { UpdateProductCommand } from '../dto/update-product.command';

export class UpdateProductUseCase {
  constructor(
    private readonly categories: CategoryRepositoryPort,
    private readonly products: ProductRepositoryPort,
  ) {}

  async execute(command: UpdateProductCommand): Promise<ProductEntity> {
    const product = await this.products.findById(command.productId);

    if (!product) {
      throw new ProductNotFoundError(command.productId);
    }

    if (command.categoryId !== undefined) {
      const category = await this.categories.findById(command.categoryId);

      if (!category) {
        throw new CategoryNotFoundError(command.categoryId);
      }
    }

    return this.products.update(command.productId, {
      name: command.name,
      description: command.description,
      imageUrl: command.imageUrl,
      categoryId: command.categoryId,
      status: command.status,
    });
  }
}
