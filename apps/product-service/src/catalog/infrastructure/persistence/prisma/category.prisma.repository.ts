import { Injectable } from '@nestjs/common';
import { Category as PrismaCategory } from '../../../../../../../prisma/generated/product';
import { CategoryEntity } from '../../../domain/entities/category.entity';
import {
  CategoryRepositoryPort,
  CreateCategoryData,
} from '../../../domain/repositories/category.repository.port';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaCategoryRepository implements CategoryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCategoryData): Promise<CategoryEntity> {
    const category = await this.prisma.category.create({ data });

    return this.toDomain(category);
  }

  async findAll(): Promise<CategoryEntity[]> {
    const categories = await this.prisma.category.findMany({
      orderBy: { id: 'asc' },
    });

    return categories.map((category) => this.toDomain(category));
  }

  async findById(categoryId: bigint): Promise<CategoryEntity | null> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    return category ? this.toDomain(category) : null;
  }

  private toDomain(category: PrismaCategory): CategoryEntity {
    return new CategoryEntity({
      id: category.id,
      name: category.name,
      slug: category.slug,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    });
  }
}
