import { CategoryEntity } from '../../domain/entities/category.entity';
import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductStatus } from '../../domain/enums/product-status.enum';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';
import { ProductRepositoryPort } from '../../domain/repositories/product.repository.port';
import { UpdateProductUseCase } from './update-product.use-case';

describe('UpdateProductUseCase', () => {
  let categories: jest.Mocked<CategoryRepositoryPort>;
  let products: jest.Mocked<ProductRepositoryPort>;
  let useCase: UpdateProductUseCase;

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
    useCase = new UpdateProductUseCase(categories, products);
  });

  it('updates an existing product', async () => {
    const product = createProduct();
    products.findById.mockResolvedValue(product);
    products.update.mockResolvedValue(product);

    await expect(
      useCase.execute({
        productId: 10n,
        name: 'Updated Shoes',
      }),
    ).resolves.toBe(product);

    expect(products.update).toHaveBeenCalledWith(10n, {
      name: 'Updated Shoes',
      description: undefined,
      imageUrl: undefined,
      categoryId: undefined,
      status: undefined,
    });
  });

  it('fails when product is missing', async () => {
    products.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ productId: 404n, name: 'Missing' }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);

    expect(products.update).not.toHaveBeenCalled();
  });

  it('validates changed category exists', async () => {
    products.findById.mockResolvedValue(createProduct());
    categories.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ productId: 10n, categoryId: 99n }),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);

    expect(products.update).not.toHaveBeenCalled();
  });

  it('updates when changed category exists', async () => {
    const product = createProduct();
    products.findById.mockResolvedValue(product);
    products.update.mockResolvedValue(product);
    categories.findById.mockResolvedValue(
      new CategoryEntity({ id: 2n, name: 'Fashion', slug: 'fashion' }),
    );

    await expect(
      useCase.execute({ productId: 10n, categoryId: 2n }),
    ).resolves.toBe(product);

    expect(products.update).toHaveBeenCalledWith(10n, {
      name: undefined,
      description: undefined,
      imageUrl: undefined,
      categoryId: 2n,
      status: undefined,
    });
  });
});

function createProduct(): ProductEntity {
  return new ProductEntity({
    id: 10n,
    name: 'Running Shoes',
    categoryId: 1n,
    sellerId: 7n,
    status: ProductStatus.Active,
  });
}
