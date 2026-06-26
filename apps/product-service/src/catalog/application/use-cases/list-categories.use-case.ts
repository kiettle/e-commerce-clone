import { CategoryEntity } from '../../domain/entities/category.entity';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';

export class ListCategoriesUseCase {
  constructor(private readonly categories: CategoryRepositoryPort) {}

  execute(): Promise<CategoryEntity[]> {
    return this.categories.findAll();
  }
}
