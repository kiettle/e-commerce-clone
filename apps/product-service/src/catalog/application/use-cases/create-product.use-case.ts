import { ProductEntity } from '../../domain/entities/product.entity';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import { DuplicateSkuCodeError } from '../../domain/errors/duplicate-sku-code.error';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';
import { ProductRepositoryPort } from '../../domain/repositories/product.repository.port';
import { CreateProductCommand } from '../dto/create-product.command';
import { ProductEventPublisherPort } from '../ports/product-event-publisher.port';

export class CreateProductUseCase {
  constructor(
    private readonly categories: CategoryRepositoryPort,
    private readonly products: ProductRepositoryPort,
    private readonly productEvents: ProductEventPublisherPort,
  ) {}

  async execute(command: CreateProductCommand): Promise<ProductEntity> {
    const category = await this.categories.findById(command.categoryId);

    if (!category) {
      throw new CategoryNotFoundError(command.categoryId);
    }

    assertUniqueSkuCodes(command.skus.map((sku) => sku.skuCode));

    const product = await this.products.create({
      name: command.name,
      description: command.description,
      imageUrl: command.imageUrl,
      categoryId: command.categoryId,
      sellerId: command.sellerId,
      status: command.status,
      skus: command.skus.map((sku) => ({
        skuCode: sku.skuCode,
        price: sku.price,
        status: sku.status,
      })),
    });

    const quantityBySkuCode = new Map(
      command.skus.map((sku) => [sku.skuCode, sku.quantity]),
    );

    await this.productEvents.publishProductCreated({
      productId: product.id,
      name: product.name,
      skus: product.skus.map((sku) => ({
        productSkuId: sku.id,
        skuCode: sku.skuCode,
        status: sku.status,
        quantity: quantityBySkuCode.get(sku.skuCode) ?? 0,
      })),
    });

    return product;
  }
}

function assertUniqueSkuCodes(skuCodes: string[]): void {
  const seenSkuCodes = new Set<string>();

  for (const skuCode of skuCodes) {
    if (seenSkuCodes.has(skuCode)) {
      throw new DuplicateSkuCodeError(skuCode);
    }

    seenSkuCodes.add(skuCode);
  }
}
