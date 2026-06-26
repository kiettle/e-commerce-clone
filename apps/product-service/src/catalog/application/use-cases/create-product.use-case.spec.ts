import { CategoryEntity } from '../../domain/entities/category.entity';
import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductSkuEntity } from '../../domain/entities/product-sku.entity';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import { ProductStatus } from '../../domain/enums/product-status.enum';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import { DuplicateSkuCodeError } from '../../domain/errors/duplicate-sku-code.error';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';
import { ProductRepositoryPort } from '../../domain/repositories/product.repository.port';
import { ProductEventPublisherPort } from '../ports/product-event-publisher.port';
import { CreateProductUseCase } from './create-product.use-case';

describe('CreateProductUseCase', () => {
  let categories: jest.Mocked<CategoryRepositoryPort>;
  let products: jest.Mocked<ProductRepositoryPort>;
  let productEvents: jest.Mocked<ProductEventPublisherPort>;
  let useCase: CreateProductUseCase;

  beforeEach(() => {
    categories = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
    };
    products = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    productEvents = {
      publishProductCreated: jest.fn(),
    };
    useCase = new CreateProductUseCase(categories, products, productEvents);
  });

  it('creates a product and publishes ProductCreated', async () => {
    categories.findById.mockResolvedValue(
      new CategoryEntity({ id: 1n, name: 'Shoes', slug: 'shoes' }),
    );
    const product = createProduct();
    products.create.mockResolvedValue(product);
    productEvents.publishProductCreated.mockResolvedValue();

    await expect(useCase.execute(createProductCommand())).resolves.toBe(product);

    expect(products.create).toHaveBeenCalledWith({
      name: 'Running Shoes',
      description: 'Lightweight running shoes',
      imageUrl: 'https://example.com/shoe.jpg',
      categoryId: 1n,
      sellerId: 7n,
      status: ProductStatus.Active,
      skus: [
        {
          skuCode: 'SHOE-BLACK-42',
          price: 39.99,
          status: ProductSkuStatus.Available,
        },
      ],
    });
    expect(productEvents.publishProductCreated).toHaveBeenCalledWith({
      productId: 10n,
      name: 'Running Shoes',
      skus: [
        {
          productSkuId: 100n,
          skuCode: 'SHOE-BLACK-42',
          status: ProductSkuStatus.Available,
          quantity: 100,
        },
      ],
    });
  });

  it('fails when category is missing', async () => {
    categories.findById.mockResolvedValue(null);

    await expect(useCase.execute(createProductCommand())).rejects.toBeInstanceOf(
      CategoryNotFoundError,
    );

    expect(products.create).not.toHaveBeenCalled();
    expect(productEvents.publishProductCreated).not.toHaveBeenCalled();
  });

  it('fails when request contains duplicate SKU codes', async () => {
    categories.findById.mockResolvedValue(
      new CategoryEntity({ id: 1n, name: 'Shoes', slug: 'shoes' }),
    );

    await expect(
      useCase.execute({
        ...createProductCommand(),
        skus: [
          {
            skuCode: 'DUPLICATE',
            price: 10,
            status: ProductSkuStatus.Available,
            quantity: 1,
          },
          {
            skuCode: 'DUPLICATE',
            price: 12,
            status: ProductSkuStatus.Available,
            quantity: 2,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(DuplicateSkuCodeError);

    expect(products.create).not.toHaveBeenCalled();
    expect(productEvents.publishProductCreated).not.toHaveBeenCalled();
  });

  it('does not publish when persistence fails', async () => {
    categories.findById.mockResolvedValue(
      new CategoryEntity({ id: 1n, name: 'Shoes', slug: 'shoes' }),
    );
    products.create.mockRejectedValue(new Error('database unavailable'));

    await expect(useCase.execute(createProductCommand())).rejects.toThrow(
      'database unavailable',
    );

    expect(productEvents.publishProductCreated).not.toHaveBeenCalled();
  });
});

function createProductCommand() {
  return {
    name: 'Running Shoes',
    description: 'Lightweight running shoes',
    imageUrl: 'https://example.com/shoe.jpg',
    categoryId: 1n,
    sellerId: 7n,
    status: ProductStatus.Active,
    skus: [
      {
        skuCode: 'SHOE-BLACK-42',
        price: 39.99,
        status: ProductSkuStatus.Available,
        quantity: 100,
      },
    ],
  };
}

function createProduct(): ProductEntity {
  return new ProductEntity({
    id: 10n,
    name: 'Running Shoes',
    description: 'Lightweight running shoes',
    imageUrl: 'https://example.com/shoe.jpg',
    categoryId: 1n,
    sellerId: 7n,
    status: ProductStatus.Active,
    skus: [
      new ProductSkuEntity({
        id: 100n,
        productId: 10n,
        skuCode: 'SHOE-BLACK-42',
        price: 39.99,
        status: ProductSkuStatus.Available,
      }),
    ],
  });
}
