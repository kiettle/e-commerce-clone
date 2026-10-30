import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CHECKOUT_FAILURE_LOGGER,
  CheckoutFailureLoggerPort,
} from './application/ports/checkout-failure-logger.port';
import { INVENTORY_STOCK, InventoryStockPort } from './application/ports/inventory-stock.port';
import { ORDER_CREATOR, OrderCreatorPort } from './application/ports/order-creator.port';
import { PRODUCT_CATALOG, ProductCatalogPort } from './application/ports/product-catalog.port';
import { AddCartItemUseCase } from './application/use-cases/add-cart-item.use-case';
import { CheckoutCartUseCase } from './application/use-cases/checkout-cart.use-case';
import { DeleteCartItemUseCase } from './application/use-cases/delete-cart-item.use-case';
import { GetActiveCartUseCase } from './application/use-cases/get-active-cart.use-case';
import { GetCheckoutStatusUseCase } from './application/use-cases/get-checkout-status.use-case';
import { UpdateCartItemUseCase } from './application/use-cases/update-cart-item.use-case';
import { CART_REPOSITORY, CartRepositoryPort } from './domain/repositories/cart.repository.port';
import {
  CHECKOUT_ATTEMPT_REPOSITORY,
  CheckoutAttemptRepositoryPort,
} from './domain/repositories/checkout-attempt.repository.port';
import { InventoryGrpcStockClient } from './infrastructure/grpc/inventory-grpc-stock.client';
import { OrderGrpcCreatorClient } from './infrastructure/grpc/order-grpc-creator.client';
import { ProductGrpcCatalogClient } from './infrastructure/grpc/product-grpc-catalog.client';
import { NestCheckoutFailureLogger } from './infrastructure/logging/nest-checkout-failure.logger';
import { PrismaCartRepository } from './infrastructure/persistence/prisma/cart.prisma.repository';
import { PrismaCheckoutAttemptRepository } from './infrastructure/persistence/prisma/checkout-attempt.prisma.repository';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { CheckoutReconciliationWorker } from './infrastructure/workers/checkout-reconciliation.worker';
import { CartsGrpcController } from './presentation/grpc/carts.grpc.controller';

@Module({
  controllers: [CartsGrpcController],
  providers: [
    PrismaService,
    {
      provide: CART_REPOSITORY,
      useClass: PrismaCartRepository,
    },
    {
      provide: CHECKOUT_ATTEMPT_REPOSITORY,
      useClass: PrismaCheckoutAttemptRepository,
    },
    {
      provide: PRODUCT_CATALOG,
      useClass: ProductGrpcCatalogClient,
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
      useFactory: (carts: CartRepositoryPort) => new GetActiveCartUseCase(carts),
      inject: [CART_REPOSITORY],
    },
    {
      provide: AddCartItemUseCase,
      useFactory: (carts: CartRepositoryPort, productCatalog: ProductCatalogPort) =>
        new AddCartItemUseCase(carts, productCatalog),
      inject: [CART_REPOSITORY, PRODUCT_CATALOG],
    },
    {
      provide: UpdateCartItemUseCase,
      useFactory: (carts: CartRepositoryPort) => new UpdateCartItemUseCase(carts),
      inject: [CART_REPOSITORY],
    },
    {
      provide: DeleteCartItemUseCase,
      useFactory: (carts: CartRepositoryPort) => new DeleteCartItemUseCase(carts),
      inject: [CART_REPOSITORY],
    },
    {
      provide: GetCheckoutStatusUseCase,
      useFactory: (attempts: CheckoutAttemptRepositoryPort) =>
        new GetCheckoutStatusUseCase(attempts),
      inject: [CHECKOUT_ATTEMPT_REPOSITORY],
    },
    {
      provide: CheckoutCartUseCase,
      useFactory: (
        carts: CartRepositoryPort,
        attempts: CheckoutAttemptRepositoryPort,
        inventory: InventoryStockPort,
        orders: OrderCreatorPort,
        checkoutFailureLogger: CheckoutFailureLoggerPort,
      ) => new CheckoutCartUseCase(carts, attempts, inventory, orders, checkoutFailureLogger),
      inject: [
        CART_REPOSITORY,
        CHECKOUT_ATTEMPT_REPOSITORY,
        INVENTORY_STOCK,
        ORDER_CREATOR,
        CHECKOUT_FAILURE_LOGGER,
      ],
    },
    {
      provide: CheckoutReconciliationWorker,
      useFactory: (
        attempts: CheckoutAttemptRepositoryPort,
        checkout: CheckoutCartUseCase,
        config: ConfigService,
      ) => new CheckoutReconciliationWorker(attempts, checkout, config),
      inject: [CHECKOUT_ATTEMPT_REPOSITORY, CheckoutCartUseCase, ConfigService],
    },
  ],
})
export class CartsModule {}
