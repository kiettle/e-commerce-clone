import { Module } from '@nestjs/common';
import {
  PRODUCT_CREATION_REPOSITORY,
  ProductCreationRepositoryPort,
} from './application/ports/product-creation.repository.port';
import { CreateCategoryUseCase } from './application/use-cases/create-category.use-case';
import { CreateProductUseCase } from './application/use-cases/create-product.use-case';
import { DeleteProductUseCase } from './application/use-cases/delete-product.use-case';
import { ListCategoriesUseCase } from './application/use-cases/list-categories.use-case';
import { SearchProductsUseCase } from './application/use-cases/search-products.use-case';
import { UpdateProductUseCase } from './application/use-cases/update-product.use-case';
import {
  CATEGORY_REPOSITORY,
  CategoryRepositoryPort,
} from './domain/repositories/category.repository.port';
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from './domain/repositories/product.repository.port';
import { PrismaCategoryRepository } from './infrastructure/persistence/prisma/category.prisma.repository';
import { PrismaProductRepository } from './infrastructure/persistence/prisma/product.prisma.repository';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { CategoriesController } from './presentation/http/categories.controller';
import { ProductsController } from './presentation/http/products.controller';

@Module({
  controllers: [CategoriesController, ProductsController],
  providers: [
    PrismaService,
    PrismaProductRepository,
    {
      provide: CATEGORY_REPOSITORY,
      useClass: PrismaCategoryRepository,
    },
    {
      provide: PRODUCT_REPOSITORY,
      useExisting: PrismaProductRepository,
    },
    {
      provide: PRODUCT_CREATION_REPOSITORY,
      useExisting: PrismaProductRepository,
    },
    {
      provide: CreateCategoryUseCase,
      useFactory: (categories: CategoryRepositoryPort) => new CreateCategoryUseCase(categories),
      inject: [CATEGORY_REPOSITORY],
    },
    {
      provide: ListCategoriesUseCase,
      useFactory: (categories: CategoryRepositoryPort) => new ListCategoriesUseCase(categories),
      inject: [CATEGORY_REPOSITORY],
    },
    {
      provide: SearchProductsUseCase,
      useFactory: (products: ProductRepositoryPort) => new SearchProductsUseCase(products),
      inject: [PRODUCT_REPOSITORY],
    },
    {
      provide: CreateProductUseCase,
      useFactory: (categories: CategoryRepositoryPort, products: ProductCreationRepositoryPort) =>
        new CreateProductUseCase(categories, products),
      inject: [CATEGORY_REPOSITORY, PRODUCT_CREATION_REPOSITORY],
    },
    {
      provide: UpdateProductUseCase,
      useFactory: (categories: CategoryRepositoryPort, products: ProductRepositoryPort) =>
        new UpdateProductUseCase(categories, products),
      inject: [CATEGORY_REPOSITORY, PRODUCT_REPOSITORY],
    },
    {
      provide: DeleteProductUseCase,
      useFactory: (products: ProductRepositoryPort) => new DeleteProductUseCase(products),
      inject: [PRODUCT_REPOSITORY],
    },
  ],
})
export class CatalogModule {}
