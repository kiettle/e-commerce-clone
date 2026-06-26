import { CategoryEntity } from '../../domain/entities/category.entity';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';
import { CreateCategoryUseCase } from './create-category.use-case';

describe('CreateCategoryUseCase', () => {
  let categories: jest.Mocked<CategoryRepositoryPort>;
  let useCase: CreateCategoryUseCase;

  beforeEach(() => {
    categories = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
    };
    useCase = new CreateCategoryUseCase(categories);
  });

  it('creates a category with a provided slug', async () => {
    const category = new CategoryEntity({
      id: 1n,
      name: 'Shoes',
      slug: 'shoes',
    });
    categories.create.mockResolvedValue(category);

    await expect(
      useCase.execute({ name: 'Shoes', slug: 'shoes' }),
    ).resolves.toBe(category);

    expect(categories.create).toHaveBeenCalledWith({
      name: 'Shoes',
      slug: 'shoes',
    });
  });

  it('generates a slug when omitted', async () => {
    const category = new CategoryEntity({
      id: 1n,
      name: 'Running Shoes',
      slug: 'running-shoes',
    });
    categories.create.mockResolvedValue(category);

    await useCase.execute({ name: 'Running Shoes' });

    expect(categories.create).toHaveBeenCalledWith({
      name: 'Running Shoes',
      slug: 'running-shoes',
    });
  });
});
