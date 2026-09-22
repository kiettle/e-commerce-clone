import { Module } from '@nestjs/common';
import {
  INVENTORY_REPOSITORY,
  InventoryRepositoryPort,
} from './domain/repositories/inventory.repository.port';
import {
  FLASH_SALE_STOCK_REPOSITORY,
  FlashSaleStockRepositoryPort,
} from './domain/repositories/flash-sale-stock.repository.port';
import { HandleFlashSaleScheduledUseCase } from './application/use-cases/handle-flash-sale-scheduled.use-case';
import { HandleProductCreatedUseCase } from './application/use-cases/handle-product-created.use-case';
import { CommitStockUseCase } from './application/use-cases/commit-stock.use-case';
import { ReleaseStockUseCase } from './application/use-cases/release-stock.use-case';
import { ReserveStockUseCase } from './application/use-cases/reserve-stock.use-case';
import { KafkaProductEventConsumer } from './infrastructure/messaging/kafka-product-event.consumer';
import { ProtobufProductEventDeserializer } from './infrastructure/messaging/protobuf-product-event-deserializer';
import { PrismaInventoryRepository } from './infrastructure/persistence/prisma/inventory.prisma.repository';
import { PrismaService } from './infrastructure/persistence/prisma/prisma.service';
import { InventoryGrpcController } from './presentation/grpc/inventory.grpc.controller';
import { KafkaFlashSaleEventConsumer } from './infrastructure/messaging/kafka-flash-sale-event.consumer';
import { ProtobufFlashSaleEventDeserializer } from './infrastructure/messaging/protobuf-flash-sale-event-deserializer';
import { PrismaFlashSaleStockRepository } from './infrastructure/persistence/prisma/flash-sale-stock.prisma.repository';

@Module({
  controllers: [InventoryGrpcController],
  providers: [
    PrismaService,
    ProtobufProductEventDeserializer,
    KafkaProductEventConsumer,
    ProtobufFlashSaleEventDeserializer,
    KafkaFlashSaleEventConsumer,
    PrismaFlashSaleStockRepository,
    {
      provide: INVENTORY_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInventoryRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: FLASH_SALE_STOCK_REPOSITORY,
      useExisting: PrismaFlashSaleStockRepository,
    },
    {
      provide: HandleFlashSaleScheduledUseCase,
      useFactory: (repository: FlashSaleStockRepositoryPort) =>
        new HandleFlashSaleScheduledUseCase(repository),
      inject: [FLASH_SALE_STOCK_REPOSITORY],
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
    {
      provide: CommitStockUseCase,
      useFactory: (inventory: InventoryRepositoryPort) =>
        new CommitStockUseCase(inventory),
      inject: [INVENTORY_REPOSITORY],
    },
  ],
})
export class InventoryModule {}
