import { Injectable } from '@nestjs/common';
import { ConflictingFlashSaleEventError } from '../../../domain/errors/conflicting-flash-sale-event.error';
import {
  FlashSaleScheduledStockEvent,
  FlashSaleStockRepositoryPort,
} from '../../../domain/repositories/flash-sale-stock.repository.port';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaFlashSaleStockRepository implements FlashSaleStockRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async initializeFromFlashSaleScheduled(event: FlashSaleScheduledStockEvent): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.processedFlashSaleEvent.create({
          data: {
            eventId: event.eventId,
            eventType: 'FLASH_SALE_SCHEDULED',
            schemaVersion: event.schemaVersion,
            payloadHash: event.payloadHash,
            flashSaleId: event.flashSaleId,
          },
        });

        await transaction.flashSaleStock.createMany({
          data: event.items.map((item) => ({
            flashSaleId: event.flashSaleId,
            flashSaleItemId: item.flashSaleItemId,
            productSkuId: item.productSkuId,
            stockLimit: item.stockLimit,
            maxQuantityPerUser: item.maxQuantityPerUser,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
          })),
        });
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      const processed = await this.prisma.processedFlashSaleEvent.findUnique({
        where: { eventId: event.eventId },
      });
      if (!processed) {
        throw error;
      }
      if (processed.payloadHash === event.payloadHash) {
        return;
      }
      throw new ConflictingFlashSaleEventError(event.eventId);
    }
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
