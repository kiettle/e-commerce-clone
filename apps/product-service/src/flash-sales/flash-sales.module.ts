import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CancelFlashSaleUseCase } from './application/use-cases/cancel-flash-sale.use-case';
import { CreateFlashSaleUseCase } from './application/use-cases/create-flash-sale.use-case';
import { GetFlashSaleUseCase } from './application/use-cases/get-flash-sale.use-case';
import { ScheduleFlashSaleUseCase } from './application/use-cases/schedule-flash-sale.use-case';
import { UpdateFlashSaleUseCase } from './application/use-cases/update-flash-sale.use-case';
import {
  FLASH_SALE_REPOSITORY,
  FlashSaleRepositoryPort,
} from './domain/repositories/flash-sale.repository.port';
import { PrismaFlashSaleRepository } from './infrastructure/persistence/prisma/flash-sale.prisma.repository';
import { FlashSalesController } from './presentation/http/flash-sales.controller';

@Module({
  imports: [CatalogModule],
  controllers: [FlashSalesController],
  providers: [
    PrismaFlashSaleRepository,
    {
      provide: FLASH_SALE_REPOSITORY,
      useExisting: PrismaFlashSaleRepository,
    },
    {
      provide: CreateFlashSaleUseCase,
      useFactory: (flashSales: FlashSaleRepositoryPort) => new CreateFlashSaleUseCase(flashSales),
      inject: [FLASH_SALE_REPOSITORY],
    },
    {
      provide: UpdateFlashSaleUseCase,
      useFactory: (flashSales: FlashSaleRepositoryPort) => new UpdateFlashSaleUseCase(flashSales),
      inject: [FLASH_SALE_REPOSITORY],
    },
    {
      provide: CancelFlashSaleUseCase,
      useFactory: (flashSales: FlashSaleRepositoryPort) => new CancelFlashSaleUseCase(flashSales),
      inject: [FLASH_SALE_REPOSITORY],
    },
    {
      provide: GetFlashSaleUseCase,
      useFactory: (flashSales: FlashSaleRepositoryPort) => new GetFlashSaleUseCase(flashSales),
      inject: [FLASH_SALE_REPOSITORY],
    },
    {
      provide: ScheduleFlashSaleUseCase,
      useFactory: (flashSales: FlashSaleRepositoryPort) => new ScheduleFlashSaleUseCase(flashSales),
      inject: [FLASH_SALE_REPOSITORY],
    },
  ],
})
export class FlashSalesModule {}
