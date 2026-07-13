import { Module } from '@nestjs/common';
import {
  CHECKOUT_FAILURE_LOGGER,
  CheckoutFailureLoggerPort,
} from './application/ports/checkout-failure-logger.port';
import {
  INVENTORY_STOCK,
  InventoryStockPort,
} from './application/ports/inventory-stock.port';
import {
  ORDER_CREATOR,
  OrderCreatorPort,
} from './application/ports/order-creator.port';
import {
  PRODUCT_CATALOG,
  ProductCatalogPort,
} from './application/ports/product-catalog.port';
import { AddCartItemUseCase } from './application/use-cases/add-cart-item.use-case';
import { CheckoutCartUseCase } from './application/use-cases/checkout-cart.use-case';
import { DeleteCartItemUseCase } from './application/use-cases/delete-cart-item.use-case';
import { GetActiveCartUseCase } from './application/use-cases/get-active-cart.use-case';
import { UpdateCartItemUseCase } from './application/use-cases/update-cart-item.use-case';
import {
  CART_REPOSITORY,
  CartRepositoryPort,
} from './domain/repositories/cart.repository.port';
import { InventoryGrpcStockClient } from './infrastructure/grpc/inventory-grpc-stock.client';
import { OrderGrpcCreatorClient } from './infrastructure/grpc/order-grpc-creator.client';
import { ProductHttpCatalogClient } from './infrastructure/http/product-http-catalog.client';
import { NestCheckoutFailureLogger } from './infrastructure/logging/nest-checkout-failure.logger';
import { PrismaCartRepository } from './infrastructure/persistence/prisma/cart.prisma.repository';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { CartItemsController } from './presentation/http/cart-items.controller';
import { CartsController } from './presentation/http/carts.controller';

@Module({
  controllers: [CartsController, CartItemsController],
  providers: [
    PrismaService,
    {
      provide: CART_REPOSITORY,
      useClass: PrismaCartRepository,
    },
    {
      provide: PRODUCT_CATALOG,
      useClass: ProductHttpCatalogClient,
    },
    {
      provide: INVENTORY_STOCK,
      useClass: InventoryGrpcStockClient,
    },
    {
      provide: ORDER_CREATOR,
      useClass: OrderGrpcCreatorClient,
    },
    {
      provide: CHECKOUT_FAILURE_LOGGER,
      useClass: NestCheckoutFailureLogger,
    },
    {
      provide: GetActiveCartUseCase,
      useFactory: (carts: CartRepositoryPort) =>
        new GetActiveCartUseCase(carts),
      inject: [CART_REPOSITORY],
    },
    {
      provide: AddCartItemUseCase,
      useFactory: (
        carts: CartRepositoryPort,
        productCatalog: ProductCatalogPort,
      ) => new AddCartItemUseCase(carts, productCatalog),
      inject: [CART_REPOSITORY, PRODUCT_CATALOG],
    },
    {
      provide: UpdateCartItemUseCase,
      useFactory: (carts: CartRepositoryPort) =>
        new UpdateCartItemUseCase(carts),
      inject: [CART_REPOSITORY],
    },
    {
      provide: DeleteCartItemUseCase,
      useFactory: (carts: CartRepositoryPort) =>
        new DeleteCartItemUseCase(carts),
      inject: [CART_REPOSITORY],
    },
    {
      provide: CheckoutCartUseCase,
      useFactory: (
        carts: CartRepositoryPort,
        inventory: InventoryStockPort,
        orders: OrderCreatorPort,
        checkoutFailureLogger: CheckoutFailureLoggerPort,
      ) =>
        new CheckoutCartUseCase(
          carts,
          inventory,
          orders,
          checkoutFailureLogger,
        ),
      inject: [
        CART_REPOSITORY,
        INVENTORY_STOCK,
        ORDER_CREATOR,
        CHECKOUT_FAILURE_LOGGER,
      ],
    },
  ],
})
export class CartsModule {}
