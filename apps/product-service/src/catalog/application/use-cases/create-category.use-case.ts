import { CategoryEntity } from '../../domain/entities/category.entity';
import { CategoryRepositoryPort } from '../../domain/repositories/category.repository.port';
import { CreateCategoryCommand } from '../dto/create-category.command';

export class CreateCategoryUseCase {
  constructor(private readonly categories: CategoryRepositoryPort) {}

  execute(command: CreateCategoryCommand): Promise<CategoryEntity> {
    return this.categories.create({
      name: command.name,
      slug: command.slug?.trim() || slugify(command.name),
    });
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
