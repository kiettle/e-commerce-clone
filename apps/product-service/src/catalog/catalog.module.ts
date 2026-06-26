import { Module } from '@nestjs/common';
import {
  PRODUCT_EVENT_PUBLISHER,
  ProductEventPublisherPort,
} from './application/ports/product-event-publisher.port';
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
import { KafkaProductEventPublisher } from './infrastructure/messaging/kafka-product-event-publisher';
import { ProtobufProductEventSerializer } from './infrastructure/messaging/protobuf-product-event-serializer';
import { PrismaCategoryRepository } from './infrastructure/persistence/prisma/category.prisma.repository';
import { PrismaProductRepository } from './infrastructure/persistence/prisma/product.prisma.repository';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { CategoriesController } from './presentation/http/categories.controller';
import { ProductsController } from './presentation/http/products.controller';

@Module({
  controllers: [CategoriesController, ProductsController],
  providers: [
    PrismaService,
    ProtobufProductEventSerializer,
    {
      provide: CATEGORY_REPOSITORY,
      useClass: PrismaCategoryRepository,
    },
    {
      provide: PRODUCT_REPOSITORY,
      useClass: PrismaProductRepository,
    },
    {
      provide: PRODUCT_EVENT_PUBLISHER,
      useClass: KafkaProductEventPublisher,
    },
    {
      provide: CreateCategoryUseCase,
      useFactory: (categories: CategoryRepositoryPort) =>
        new CreateCategoryUseCase(categories),
      inject: [CATEGORY_REPOSITORY],
    },
    {
      provide: ListCategoriesUseCase,
      useFactory: (categories: CategoryRepositoryPort) =>
        new ListCategoriesUseCase(categories),
      inject: [CATEGORY_REPOSITORY],
    },
    {
      provide: SearchProductsUseCase,
      useFactory: (products: ProductRepositoryPort) =>
        new SearchProductsUseCase(products),
      inject: [PRODUCT_REPOSITORY],
    },
    {
      provide: CreateProductUseCase,
      useFactory: (
        categories: CategoryRepositoryPort,
        products: ProductRepositoryPort,
        productEvents: ProductEventPublisherPort,
      ) => new CreateProductUseCase(categories, products, productEvents),
      inject: [CATEGORY_REPOSITORY, PRODUCT_REPOSITORY, PRODUCT_EVENT_PUBLISHER],
    },
    {
      provide: UpdateProductUseCase,
      useFactory: (
        categories: CategoryRepositoryPort,
        products: ProductRepositoryPort,
      ) => new UpdateProductUseCase(categories, products),
      inject: [CATEGORY_REPOSITORY, PRODUCT_REPOSITORY],
    },
    {
      provide: DeleteProductUseCase,
      useFactory: (products: ProductRepositoryPort) =>
        new DeleteProductUseCase(products),
      inject: [PRODUCT_REPOSITORY],
    },
  ],
})
export class CatalogModule {}
