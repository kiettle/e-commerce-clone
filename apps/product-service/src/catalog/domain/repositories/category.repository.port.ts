import { CategoryEntity } from '../entities/category.entity';

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');

export interface CreateCategoryData {
  name: string;
  slug: string;
}

export interface CategoryRepositoryPort {
  create(data: CreateCategoryData): Promise<CategoryEntity>;
  findAll(): Promise<CategoryEntity[]>;
  findById(categoryId: bigint): Promise<CategoryEntity | null>;
}
