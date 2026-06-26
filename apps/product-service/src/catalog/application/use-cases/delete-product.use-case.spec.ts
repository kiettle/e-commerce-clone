import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductStatus } from '../../domain/enums/product-status.enum';
import { ProductNotFoundError } from '../../domain/errors/product-not-found.error';
import { ProductRepositoryPort } from '../../domain/repositories/product.repository.port';
import { DeleteProductUseCase } from './delete-product.use-case';

describe('DeleteProductUseCase', () => {
  let products: jest.Mocked<ProductRepositoryPort>;
  let useCase: DeleteProductUseCase;

  beforeEach(() => {
    products = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    useCase = new DeleteProductUseCase(products);
  });

  it('soft-deletes an existing product', async () => {
    const product = createProduct(ProductStatus.Active);
    const deletedProduct = createProduct(ProductStatus.Deleted);
    products.findById.mockResolvedValue(product);
    products.softDelete.mockResolvedValue(deletedProduct);

    await expect(useCase.execute(10n)).resolves.toBe(deletedProduct);

    expect(products.softDelete).toHaveBeenCalledWith(10n);
  });

  it('fails when product is missing', async () => {
    products.findById.mockResolvedValue(null);

    await expect(useCase.execute(404n)).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );

    expect(products.softDelete).not.toHaveBeenCalled();
  });
});

function createProduct(status: ProductStatus): ProductEntity {
  return new ProductEntity({
    id: 10n,
    name: 'Running Shoes',
    categoryId: 1n,
    sellerId: 7n,
    status,
  });
}
