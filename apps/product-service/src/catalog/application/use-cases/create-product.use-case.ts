import { ProductEntity } from '../../domain/entities/product.entity';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import { DuplicateSkuCodeError } from '../../domain/errors/duplicate-sku-code.error';
import { InvalidSkuCodeError } from '../../domain/errors/invalid-sku-code.error';
import { InvalidSkuQuantityError } from '../../domain/errors/invalid-sku-quantity.error';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';
import { CreateProductCommand } from '../dto/create-product.command';
import { ProductCreationRepositoryPort } from '../ports/product-creation.repository.port';

export class CreateProductUseCase {
  constructor(
    private readonly categories: CategoryRepositoryPort,
    private readonly products: ProductCreationRepositoryPort,
  ) {}

  async execute(command: CreateProductCommand): Promise<ProductEntity> {
    const category = await this.categories.findById(command.categoryId);

    if (!category) {
      throw new CategoryNotFoundError(command.categoryId);
    }

    validateSkus(command.skus);

    return this.products.createWithOutbox({
      eventId: globalThis.crypto.randomUUID(),
      occurredAt: new Date(),
      name: command.name,
      description: command.description,
      imageUrl: command.imageUrl,
      categoryId: command.categoryId,
      sellerId: command.sellerId,
      status: command.status,
      skus: command.skus,
    });
  }
}

function validateSkus(skus: CreateProductCommand['skus']): void {
  const seenSkuCodes = new Set<string>();

  for (const sku of skus) {
    if (!sku.skuCode.trim()) {
      throw new InvalidSkuCodeError();
    }

    if (seenSkuCodes.has(sku.skuCode)) {
      throw new DuplicateSkuCodeError(sku.skuCode);
    }

    if (!Number.isInteger(sku.quantity) || sku.quantity < 0) {
      throw new InvalidSkuQuantityError(sku.skuCode, sku.quantity);
    }

    seenSkuCodes.add(sku.skuCode);
  }
}
