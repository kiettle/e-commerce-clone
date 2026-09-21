import { Injectable } from '@nestjs/common';
import {
  FlashSaleStock,
  InventoryStock,
  Prisma,
  StockReservation,
} from '../../../../../../../prisma/generated/inventory';
import { ConflictingProductEventError } from '../../../domain/errors/conflicting-product-event.error';
import { ConflictingReservationError } from '../../../domain/errors/conflicting-reservation.error';
import { FlashSaleReservationError } from '../../../domain/errors/flash-sale-reservation.error';
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
  StockOperation,
  StockOperationItem,
} from '../../../domain/repositories/inventory.repository.port';
import { validateFlashSaleReservation } from '../../../domain/services/validate-flash-sale-reservation';
import { PrismaService } from './prisma.service';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class PrismaInventoryRepository implements InventoryRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async initializeFromProductCreated(event: ProductCreatedStockEvent): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.processedProductEvent.create({
          data: {
            eventId: event.eventId,
            eventType: 'PRODUCT_CREATED',
            schemaVersion: event.schemaVersion,
            payloadHash: event.payloadHash,
            productId: event.productId,
          },
        });

        for (const sku of event.skus) {
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
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      const processedEvent = await this.prisma.processedProductEvent.findUnique({
        where: { eventId: event.eventId },
      });

      if (!processedEvent) {
        throw error;
      }

      if (processedEvent.payloadHash === event.payloadHash) {
        return;
      }

      throw new ConflictingProductEventError(event.eventId);
    }
  }

  async reserveStock(operation: StockOperation): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await lockReservations(transaction, operation.cartId, operation.items);
        const reservations = await this.findReservations(
          transaction,
          operation.cartId,
          operation.items,
        );
        const reservationBySkuId = toReservationMap(reservations);
        const newItems = operation.items.filter((item) => {
          const reservation = reservationBySkuId.get(item.productSkuId.toString());
          if (!reservation) {
            return true;
          }
          if (isIdenticalReservation(operation, item, reservation)) {
            return false;
          }
          throw new ConflictingReservationError(item.productSkuId);
        });

        if (newItems.length === 0) {
          return;
        }

        await lockInventoryStocks(transaction, newItems);
        const stocks = await this.findStocksBySkuIds(transaction, newItems);
        const stockBySkuId = toStockMap(stocks);
        const saleItems = newItems.filter(hasSaleContext);
        await lockFlashSaleStocks(transaction, saleItems);
        const saleStocks = await this.findFlashSaleStocks(transaction, saleItems);
        const saleStockByItemId = toSaleStockMap(saleStocks);
        const [{ now }] = await transaction.$queryRaw<Array<{ now: Date }>>`
          SELECT clock_timestamp() AS "now"
        `;

        const claimedSaleItems =
          saleItems.length === 0
            ? []
            : await transaction.stockReservation.findMany({
                where: {
                  userId: operation.userId,
                  flashSaleItemId: {
                    in: saleItems.map((item) => item.flashSaleItemId!),
                  },
                  status: {
                    in: [StockReservationStatus.Reserved, StockReservationStatus.Committed],
                  },
                },
              });

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

          if (hasSaleContext(item)) {
            const saleStock = saleStockByItemId.get(item.flashSaleItemId.toString());
            validateFlashSaleReservation(operation, item, saleStock, claimedSaleItems, now);
          }
        }

        for (const item of newItems) {
          const updateResult = await transaction.inventoryStock.updateMany({
            where: {
              productSkuId: item.productSkuId,
              status: InventoryStockStatus.Active,
              availableQuantity: { gte: item.quantity },
            },
            data: {
              availableQuantity: { decrement: item.quantity },
              reservedQuantity: { increment: item.quantity },
            },
          });
          if (updateResult.count !== 1) {
            throw new InsufficientStockError(item.productSkuId);
          }

          if (hasSaleContext(item)) {
            const updatedSaleStock = await transaction.$queryRaw<Array<{ id: bigint }>>`
              UPDATE "flash_sale_stocks"
              SET "reserved_quantity" = "reserved_quantity" + ${item.quantity},
                  "updated_at" = clock_timestamp()
              WHERE "flash_sale_id" = ${item.flashSaleId}
                AND "flash_sale_item_id" = ${item.flashSaleItemId}
                AND "product_sku_id" = ${item.productSkuId}
                AND "starts_at" <= clock_timestamp()
                AND "ends_at" > clock_timestamp()
                AND "reserved_quantity" + "sold_quantity" + ${item.quantity} <= "quantity_limit"
              RETURNING "id"
            `;
            if (updatedSaleStock.length !== 1) {
              const [{ currentTime }] = await transaction.$queryRaw<
                Array<{ currentTime: Date }>
              >`SELECT clock_timestamp() AS "currentTime"`;
              throw new FlashSaleReservationError(
                saleStockByItemId.get(item.flashSaleItemId.toString())!.endsAt <= currentTime
                  ? 'FLASH_SALE_ENDED'
                  : 'FLASH_SALE_SOLD_OUT',
              );
            }
          }

          await transaction.stockReservation.create({
            data: {
              cartId: operation.cartId,
              checkoutId: operation.checkoutId,
              userId: operation.userId,
              productSkuId: item.productSkuId,
              flashSaleId: item.flashSaleId ?? null,
              flashSaleItemId: item.flashSaleItemId ?? null,
              quantity: item.quantity,
              status: StockReservationStatus.Reserved,
            },
          });
          await transaction.stockTransaction.create({
            data: {
              cartId: operation.cartId,
              productSkuId: item.productSkuId,
              type: StockTransactionType.Reserve,
              quantity: item.quantity,
            },
          });
        }
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
      if (await this.isReservationReplay(operation)) {
        return;
      }
      if (await this.hasActiveSaleClaim(operation)) {
        throw new FlashSaleReservationError('FLASH_SALE_LIMIT_REACHED');
      }
      throw new ConflictingReservationError(operation.items[0].productSkuId);
    }
  }

  async releaseStock(operation: StockOperation): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await lockReservations(transaction, operation.cartId, operation.items);
      const reservations = await this.findReservations(
        transaction,
        operation.cartId,
        operation.items,
      );
      const reservationBySkuId = toReservationMap(reservations);

      for (const item of operation.items) {
        const reservation = reservationBySkuId.get(item.productSkuId.toString());

        if (!reservation) {
          throw new ReservationNotFoundError(item.productSkuId);
        }

        assertReservationMatches(operation, item, reservation, 'Release');

        if (reservation.status === StockReservationStatus.Committed) {
          throw new InvalidStockOperationError('Committed reservations cannot be released.');
        }
      }

      for (const item of operation.items) {
        const reservation = reservationBySkuId.get(item.productSkuId.toString())!;

        if (reservation.status === StockReservationStatus.Released) {
          continue;
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
          throw new InvalidStockOperationError('Reserved quantity is lower than release quantity.');
        }

        if (hasSaleContext(item)) {
          const updatedSaleStock = await transaction.$queryRaw<Array<{ id: bigint }>>`
            UPDATE "flash_sale_stocks"
            SET "reserved_quantity" = "reserved_quantity" - ${item.quantity},
                "updated_at" = clock_timestamp()
            WHERE "flash_sale_id" = ${item.flashSaleId}
              AND "flash_sale_item_id" = ${item.flashSaleItemId}
              AND "product_sku_id" = ${item.productSkuId}
              AND "reserved_quantity" >= ${item.quantity}
            RETURNING "id"
          `;
          if (updatedSaleStock.length !== 1) {
            throw new InvalidStockOperationError(
              'Flash-sale reserved quantity is lower than release quantity.',
            );
          }
        }

        await transaction.stockReservation.update({
          where: {
            cartId_productSkuId: {
              cartId: operation.cartId,
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
            cartId: operation.cartId,
            productSkuId: item.productSkuId,
            type: StockTransactionType.Release,
            quantity: item.quantity,
          },
        });
      }
    });
  }

  async commitStock(operation: StockOperation): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await lockReservations(transaction, operation.cartId, operation.items);
      const reservations = await this.findReservations(
        transaction,
        operation.cartId,
        operation.items,
      );
      const reservationBySkuId = toReservationMap(reservations);

      for (const item of operation.items) {
        const reservation = reservationBySkuId.get(item.productSkuId.toString());

        if (!reservation) {
          throw new ReservationNotFoundError(item.productSkuId);
        }

        assertReservationMatches(operation, item, reservation, 'Commit');

        if (reservation.status === StockReservationStatus.Released) {
          throw new InvalidStockOperationError('Released reservations cannot be committed.');
        }
      }

      for (const item of operation.items) {
        const reservation = reservationBySkuId.get(item.productSkuId.toString())!;

        if (reservation.status === StockReservationStatus.Committed) {
          continue;
        }

        const updateResult = await transaction.inventoryStock.updateMany({
          where: {
            productSkuId: item.productSkuId,
            reservedQuantity: {
              gte: item.quantity,
            },
          },
          data: {
            reservedQuantity: {
              decrement: item.quantity,
            },
          },
        });

        if (updateResult.count !== 1) {
          throw new InvalidStockOperationError('Reserved quantity is lower than commit quantity.');
        }

        if (hasSaleContext(item)) {
          const updatedSaleStock = await transaction.$queryRaw<Array<{ id: bigint }>>`
            UPDATE "flash_sale_stocks"
            SET "reserved_quantity" = "reserved_quantity" - ${item.quantity},
                "sold_quantity" = "sold_quantity" + ${item.quantity},
                "updated_at" = clock_timestamp()
            WHERE "flash_sale_id" = ${item.flashSaleId}
              AND "flash_sale_item_id" = ${item.flashSaleItemId}
              AND "product_sku_id" = ${item.productSkuId}
              AND "reserved_quantity" >= ${item.quantity}
              AND "sold_quantity" + ${item.quantity} <= "quantity_limit"
            RETURNING "id"
          `;
          if (updatedSaleStock.length !== 1) {
            throw new InvalidStockOperationError(
              'Flash-sale reserved quantity is lower than commit quantity.',
            );
          }
        }

        await transaction.stockReservation.update({
          where: {
            cartId_productSkuId: {
              cartId: operation.cartId,
              productSkuId: item.productSkuId,
            },
          },
          data: {
            status: StockReservationStatus.Committed,
          },
        });

        await transaction.stockTransaction.create({
          data: {
            cartId: operation.cartId,
            productSkuId: item.productSkuId,
            type: StockTransactionType.Commit,
            quantity: item.quantity,
          },
        });
      }
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

  private findReservations(
    transaction: TransactionClient,
    cartId: bigint,
    items: StockOperationItem[],
  ): Promise<StockReservation[]> {
    return transaction.stockReservation.findMany({
      where: {
        cartId,
        productSkuId: {
          in: items.map((item) => item.productSkuId),
        },
      },
    });
  }

  private findFlashSaleStocks(
    transaction: TransactionClient,
    items: StockOperationItem[],
  ): Promise<FlashSaleStock[]> {
    return transaction.flashSaleStock.findMany({
      where: {
        flashSaleItemId: {
          in: items.map((item) => item.flashSaleItemId!),
        },
      },
    });
  }

  private async isReservationReplay(operation: StockOperation): Promise<boolean> {
    const reservations = await this.prisma.stockReservation.findMany({
      where: {
        cartId: operation.cartId,
        productSkuId: { in: operation.items.map((item) => item.productSkuId) },
      },
    });
    const reservationBySkuId = toReservationMap(reservations);
    return operation.items.every((item) => {
      const reservation = reservationBySkuId.get(item.productSkuId.toString());
      return reservation != null && isIdenticalReservation(operation, item, reservation);
    });
  }

  private async hasActiveSaleClaim(operation: StockOperation): Promise<boolean> {
    const saleItemIds = operation.items.filter(hasSaleContext).map((item) => item.flashSaleItemId);
    if (saleItemIds.length === 0) return false;

    const reservation = await this.prisma.stockReservation.findFirst({
      where: {
        userId: operation.userId,
        flashSaleItemId: { in: saleItemIds },
        status: {
          in: [StockReservationStatus.Reserved, StockReservationStatus.Committed],
        },
      },
    });
    return reservation != null;
  }
}

async function lockReservations(
  transaction: TransactionClient,
  cartId: bigint,
  items: StockOperationItem[],
): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id"
    FROM "stock_reservations"
    WHERE "cart_id" = ${cartId}
      AND "product_sku_id" IN (${Prisma.join(items.map((item) => item.productSkuId))})
    ORDER BY "product_sku_id"
    FOR UPDATE
  `;
}

async function lockInventoryStocks(
  transaction: TransactionClient,
  items: StockOperationItem[],
): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id"
    FROM "inventory_stocks"
    WHERE "product_sku_id" IN (${Prisma.join(items.map((item) => item.productSkuId))})
    ORDER BY "product_sku_id"
    FOR UPDATE
  `;
}

async function lockFlashSaleStocks(
  transaction: TransactionClient,
  items: StockOperationItem[],
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  await transaction.$queryRaw`
    SELECT "id"
    FROM "flash_sale_stocks"
    WHERE "flash_sale_item_id" IN (${Prisma.join(items.map((item) => item.flashSaleItemId!))})
    ORDER BY "flash_sale_item_id"
    FOR UPDATE
  `;
}

function toStockMap(stocks: InventoryStock[]): Map<string, InventoryStock> {
  return new Map(stocks.map((stock) => [stock.productSkuId.toString(), stock]));
}

function toReservationMap(reservations: StockReservation[]): Map<string, StockReservation> {
  return new Map(
    reservations.map((reservation) => [reservation.productSkuId.toString(), reservation]),
  );
}

function toSaleStockMap(stocks: FlashSaleStock[]): Map<string, FlashSaleStock> {
  return new Map(stocks.map((stock) => [stock.flashSaleItemId.toString(), stock]));
}

function hasSaleContext(
  item: StockOperationItem,
): item is StockOperationItem & { flashSaleId: bigint; flashSaleItemId: bigint } {
  return item.flashSaleId != null && item.flashSaleItemId != null;
}

function assertReservationMatches(
  operation: StockOperation,
  item: StockOperationItem,
  reservation: StockReservation,
  action: 'Commit' | 'Release',
): void {
  const storedIdentityMatches =
    (reservation.checkoutId == null && reservation.userId == null) ||
    (reservation.checkoutId === operation.checkoutId && reservation.userId === operation.userId);
  if (
    !storedIdentityMatches ||
    reservation.quantity !== item.quantity ||
    reservation.flashSaleId !== (item.flashSaleId ?? null) ||
    reservation.flashSaleItemId !== (item.flashSaleItemId ?? null)
  ) {
    throw new InvalidStockOperationError(`${action} request does not match the reservation.`);
  }
}

function isIdenticalReservation(
  operation: StockOperation,
  item: StockOperationItem,
  reservation: StockReservation,
): boolean {
  const identityMatches =
    (reservation.checkoutId == null && reservation.userId == null) ||
    (reservation.checkoutId === operation.checkoutId && reservation.userId === operation.userId);
  return (
    identityMatches &&
    reservation.quantity === item.quantity &&
    reservation.flashSaleId === (item.flashSaleId ?? null) &&
    reservation.flashSaleItemId === (item.flashSaleItemId ?? null) &&
    (reservation.status === StockReservationStatus.Reserved ||
      reservation.status === StockReservationStatus.Committed)
  );
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
