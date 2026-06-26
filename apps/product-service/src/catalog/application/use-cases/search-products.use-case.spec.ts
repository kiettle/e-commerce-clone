import { ProductRepositoryPort } from '../../domain/repositories/product.repository.port';
import { SearchProductsUseCase } from './search-products.use-case';

describe('SearchProductsUseCase', () => {
  it('forwards optional filters to the repository', async () => {
    const products: jest.Mocked<ProductRepositoryPort> = {
      create: jest.fn(),
      findById: jest.fn(),
      search: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    const useCase = new SearchProductsUseCase(products);

    await expect(
      useCase.execute({ name: 'shoe', categoryId: 1n }),
    ).resolves.toEqual([]);

    expect(products.search).toHaveBeenCalledWith({
      name: 'shoe',
      categoryId: 1n,
    });
  });
});
