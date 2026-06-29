import { Injectable } from '@nestjs/common';
import {
  InventoryStock,
  Prisma,
  StockReservation,
} from '../../../../../../../prisma/generated/inventory';
import { ConflictingReservationError } from '../../../domain/errors/conflicting-reservation.error';
import { InsufficientStockError } from '../../../domain/errors/insufficient-stock.error';
import { InvalidStockOperationError } from '../../../domain/errors/invalid-stock-operation.error';
import { ReservationNotFoundError } from '../../../domain/errors/reservation-not-found.error';
import { StockNotFoundError } from '../../../domain/errors/stock-not-found.error';
import { InventoryStockStatus } from '../../../domain/enums/inventory-stock-status.enum';
import { StockReservationStatus } from '../../../domain/enums/stock-reservation-status.enum';
import { StockTransactionType } from '../../../domain/enums/stock-transaction-type.enum';
import {
  InventoryRepositoryPort,
  ProductCreatedStockEvent,
  StockOperationItem,
} from '../../../domain/repositories/inventory.repository.port';
import { PrismaService } from './prisma.service';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class PrismaInventoryRepository implements InventoryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async initializeFromProductCreated(
    event: ProductCreatedStockEvent,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const processedEvent = await transaction.processedProductEvent.findUnique({
        where: { eventId: event.eventId },
      });

      if (processedEvent) {
        return;
      }

      for (const sku of event.skus) {
        const existingStock = await transaction.inventoryStock.findUnique({
          where: { productSkuId: sku.productSkuId },
        });

        if (existingStock) {
          continue;
        }

        await transaction.inventoryStock.create({
          data: {
            productId: event.productId,
            productSkuId: sku.productSkuId,
            skuCode: sku.skuCode,
            status: InventoryStockStatus.Active,
            availableQuantity: sku.quantity,
            reservedQuantity: 0,
          },
        });

        await transaction.stockTransaction.create({
          data: {
            productSkuId: sku.productSkuId,
            type: StockTransactionType.Initialize,
            quantity: sku.quantity,
          },
        });
      }

      await transaction.processedProductEvent.create({
        data: {
          eventId: event.eventId,
          eventType: 'PRODUCT_CREATED',
          productId: event.productId,
        },
      });
    });
  }

  async reserveStock(
    cartId: bigint,
    items: StockOperationItem[],
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const newItems = await this.filterAlreadyReservedItems(
        transaction,
        cartId,
        items,
      );

      if (newItems.length === 0) {
        return;
      }

      const stocks = await this.findStocksBySkuIds(transaction, newItems);
      const stockBySkuId = toStockMap(stocks);

      for (const item of newItems) {
        const stock = stockBySkuId.get(item.productSkuId.toString());

        if (!stock) {
          throw new StockNotFoundError(item.productSkuId);
        }

        if (
          stock.status !== InventoryStockStatus.Active ||
          stock.availableQuantity < item.quantity
        ) {
          throw new InsufficientStockError(item.productSkuId);
        }
      }

      for (const item of newItems) {
        const updateResult = await transaction.inventoryStock.updateMany({
          where: {
            productSkuId: item.productSkuId,
            status: InventoryStockStatus.Active,
            availableQuantity: {
              gte: item.quantity,
            },
          },
          data: {
            availableQuantity: {
              decrement: item.quantity,
            },
            reservedQuantity: {
              increment: item.quantity,
            },
          },
        });

        if (updateResult.count !== 1) {
          throw new InsufficientStockError(item.productSkuId);
        }

        await transaction.stockReservation.create({
          data: {
            cartId,
            productSkuId: item.productSkuId,
            quantity: item.quantity,
            status: StockReservationStatus.Reserved,
          },
        });

        await transaction.stockTransaction.create({
          data: {
            cartId,
            productSkuId: item.productSkuId,
            type: StockTransactionType.Reserve,
            quantity: item.quantity,
          },
        });
      }
    });
  }

  async releaseStock(
    cartId: bigint,
    items: StockOperationItem[],
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const reservations = await transaction.stockReservation.findMany({
        where: {
          cartId,
          productSkuId: {
            in: items.map((item) => item.productSkuId),
          },
        },
      });
      const reservationBySkuId = toReservationMap(reservations);

      for (const item of items) {
        const reservation = reservationBySkuId.get(item.productSkuId.toString());

        if (!reservation) {
          throw new ReservationNotFoundError(item.productSkuId);
        }

        if (reservation.status === StockReservationStatus.Released) {
          continue;
        }

        if (reservation.quantity !== item.quantity) {
          throw new InvalidStockOperationError(
            'Release quantity must match reserved quantity.',
          );
        }

        const updateResult = await transaction.inventoryStock.updateMany({
          where: {
            productSkuId: item.productSkuId,
            reservedQuantity: {
              gte: item.quantity,
            },
          },
          data: {
            availableQuantity: {
              increment: item.quantity,
            },
            reservedQuantity: {
              decrement: item.quantity,
            },
          },
        });

        if (updateResult.count !== 1) {
          throw new InvalidStockOperationError(
            'Reserved quantity is lower than release quantity.',
          );
        }

        await transaction.stockReservation.update({
          where: {
            cartId_productSkuId: {
              cartId,
              productSkuId: item.productSkuId,
            },
          },
          data: {
            status: StockReservationStatus.Released,
            releasedAt: new Date(),
          },
        });

        await transaction.stockTransaction.create({
          data: {
            cartId,
            productSkuId: item.productSkuId,
            type: StockTransactionType.Release,
            quantity: item.quantity,
          },
        });
      }
    });
  }

  private async filterAlreadyReservedItems(
    transaction: TransactionClient,
    cartId: bigint,
    items: StockOperationItem[],
  ): Promise<StockOperationItem[]> {
    const reservations = await transaction.stockReservation.findMany({
      where: {
        cartId,
        productSkuId: {
          in: items.map((item) => item.productSkuId),
        },
      },
    });
    const reservationBySkuId = toReservationMap(reservations);

    return items.filter((item) => {
      const reservation = reservationBySkuId.get(item.productSkuId.toString());

      if (!reservation) {
        return true;
      }

      if (
        reservation.status === StockReservationStatus.Reserved &&
        reservation.quantity === item.quantity
      ) {
        return false;
      }

      throw new ConflictingReservationError(item.productSkuId);
    });
  }

  private findStocksBySkuIds(
    transaction: TransactionClient,
    items: StockOperationItem[],
  ): Promise<InventoryStock[]> {
    return transaction.inventoryStock.findMany({
      where: {
        productSkuId: {
          in: items.map((item) => item.productSkuId),
        },
      },
    });
  }
}

function toStockMap(stocks: InventoryStock[]): Map<string, InventoryStock> {
  return new Map(
    stocks.map((stock) => [stock.productSkuId.toString(), stock]),
  );
}

function toReservationMap(
  reservations: StockReservation[],
): Map<string, StockReservation> {
  return new Map(
    reservations.map((reservation) => [
      reservation.productSkuId.toString(),
      reservation,
    ]),
  );
}
