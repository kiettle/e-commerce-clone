import { Module } from '@nestjs/common';
import {
  INVENTORY_REPOSITORY,
  InventoryRepositoryPort,
} from './domain/repositories/inventory.repository.port';
import { HandleProductCreatedUseCase } from './application/use-cases/handle-product-created.use-case';
import { ReleaseStockUseCase } from './application/use-cases/release-stock.use-case';
import { ReserveStockUseCase } from './application/use-cases/reserve-stock.use-case';
import { KafkaProductEventConsumer } from './infrastructure/messaging/kafka-product-event.consumer';
import { ProtobufProductEventDeserializer } from './infrastructure/messaging/protobuf-product-event-deserializer';
import { PrismaInventoryRepository } from './infrastructure/persistence/prisma/inventory.prisma.repository';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { InventoryGrpcController } from './presentation/grpc/inventory.grpc.controller';

@Module({
  controllers: [InventoryGrpcController],
  providers: [
    PrismaService,
    ProtobufProductEventDeserializer,
    KafkaProductEventConsumer,
    {
      provide: INVENTORY_REPOSITORY,
      useClass: PrismaInventoryRepository,
    },
    {
      provide: HandleProductCreatedUseCase,
      useFactory: (inventory: InventoryRepositoryPort) =>
        new HandleProductCreatedUseCase(inventory),
      inject: [INVENTORY_REPOSITORY],
    },
    {
      provide: ReserveStockUseCase,
      useFactory: (inventory: InventoryRepositoryPort) =>
        new ReserveStockUseCase(inventory),
      inject: [INVENTORY_REPOSITORY],
    },
    {
      provide: ReleaseStockUseCase,
      useFactory: (inventory: InventoryRepositoryPort) =>
        new ReleaseStockUseCase(inventory),
      inject: [INVENTORY_REPOSITORY],
    },
  ],
})
export class InventoryModule {}
