import { Module } from '@nestjs/common';
import { CreateOrderUseCase } from './application/use-cases/create-order.use-case';
import { GetOrderByCheckoutIdUseCase } from './application/use-cases/get-order-by-checkout-id.use-case';
import {
  ORDER_REPOSITORY,
  OrderRepositoryPort,
} from './domain/repositories/order.repository.port';
import { PrismaOrderRepository } from './infrastructure/persistence/prisma/order.prisma.repository';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { OrdersGrpcController } from './presentation/grpc/orders.grpc.controller';

@Module({
  controllers: [OrdersGrpcController],
  providers: [
    PrismaService,
    {
      provide: ORDER_REPOSITORY,
      useClass: PrismaOrderRepository,
    },
    {
      provide: CreateOrderUseCase,
      useFactory: (orders: OrderRepositoryPort) =>
        new CreateOrderUseCase(orders),
      inject: [ORDER_REPOSITORY],
    },
    {
      provide: GetOrderByCheckoutIdUseCase,
      useFactory: (orders: OrderRepositoryPort) =>
        new GetOrderByCheckoutIdUseCase(orders),
      inject: [ORDER_REPOSITORY],
    },
  ],
})
export class OrdersModule {}
