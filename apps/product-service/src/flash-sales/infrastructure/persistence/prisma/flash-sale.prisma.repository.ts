import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../../../prisma/generated/product';
import { ProductSkuStatus } from '../../../../catalog/domain/enums/product-sku-status.enum';
import { ProductStatus } from '../../../../catalog/domain/enums/product-status.enum';
import { PrismaService } from '../../../../catalog/infrastructure/persistence/prisma/prisma.service';
import { FlashSaleItemEntity } from '../../../domain/entities/flash-sale-item.entity';
import { FlashSaleEntity } from '../../../domain/entities/flash-sale.entity';
import { FlashSaleStatus } from '../../../domain/enums/flash-sale-status.enum';
import { FlashSaleNotDraftError } from '../../../domain/errors/flash-sale-not-draft.error';
import { FlashSaleNotFoundError } from '../../../domain/errors/flash-sale-not-found.error';
import { FlashSaleOverlapError } from '../../../domain/errors/flash-sale-overlap.error';
import { FlashSalePriceChangedError } from '../../../domain/errors/flash-sale-price-changed.error';
import { FlashSaleProductInactiveError } from '../../../domain/errors/flash-sale-product-inactive.error';
import { FlashSaleScheduleTimeError } from '../../../domain/errors/flash-sale-schedule-time.error';
import { FlashSaleSkuInactiveError } from '../../../domain/errors/flash-sale-sku-inactive.error';
import { InvalidFlashSaleError } from '../../../domain/errors/invalid-flash-sale.error';
import {
  FlashSaleRepositoryPort,
  FlashSaleSkuReference,
  ScheduleFlashSaleRequest,
} from '../../../domain/repositories/flash-sale.repository.port';

type PrismaFlashSaleWithItems = Prisma.FlashSaleGetPayload<{
  include: { items: true };
}>;

interface LockedFlashSaleRow {
  id: bigint;
  starts_at: Date;
  ends_at: Date;
  status: string;
}

interface ScheduledItemRow {
  id: bigint;
  product_sku_id: bigint;
  regular_price: Prisma.Decimal;
  sale_price: Prisma.Decimal;
  quantity: number;
}

interface LockedSkuRow {
  id: bigint;
  product_id: bigint;
  price: Prisma.Decimal;
  sku_status: string;
  product_status: string;
}

@Injectable()
export class PrismaFlashSaleRepository implements FlashSaleRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findSkusByIds(productSkuIds: bigint[]): Promise<FlashSaleSkuReference[]> {
    const skus = await this.prisma.productSku.findMany({
      where: { id: { in: productSkuIds } },
      select: { id: true, price: true, status: true },
    });

    return skus.map((sku) => ({
      id: sku.id,
      price: Number(sku.price),
      active: sku.status === ProductSkuStatus.Available,
    }));
  }

  async create(flashSale: FlashSaleEntity): Promise<FlashSaleEntity> {
    const created = await this.prisma.$transaction((transaction) =>
      transaction.flashSale.create({
        data: {
          name: flashSale.name,
          description: flashSale.description,
          startsAt: flashSale.startsAt,
          endsAt: flashSale.endsAt,
          status: FlashSaleStatus.Draft,
          items: {
            create: flashSale.items.map((item) => ({
              productSkuId: item.productSkuId,
              originalPrice: item.originalPrice,
              salePrice: item.salePrice,
              quantity: item.quantity,
            })),
          },
        },
        include: { items: { orderBy: { id: 'asc' } } },
      }),
    );

    return this.toDomain(created);
  }

  async findById(flashSaleId: bigint): Promise<FlashSaleEntity | null> {
    const flashSale = await this.prisma.flashSale.findUnique({
      where: { id: flashSaleId },
      include: { items: { orderBy: { id: 'asc' } } },
    });

    return flashSale ? this.toDomain(flashSale) : null;
  }

  async replaceDraft(flashSale: FlashSaleEntity): Promise<FlashSaleEntity> {
    const flashSaleId = this.requireId(flashSale);

    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.flashSale.updateMany({
        where: { id: flashSaleId, status: FlashSaleStatus.Draft },
        data: {
          name: flashSale.name,
          description: flashSale.description,
          startsAt: flashSale.startsAt,
          endsAt: flashSale.endsAt,
        },
      });
      if (result.count === 0) {
        throw new FlashSaleNotDraftError();
      }

      await transaction.flashSaleItem.deleteMany({ where: { flashSaleId } });
      if (flashSale.items.length > 0) {
        await transaction.flashSaleItem.createMany({
          data: flashSale.items.map((item) => ({
            flashSaleId,
            productSkuId: item.productSkuId,
            originalPrice: item.originalPrice,
            salePrice: item.salePrice,
            quantity: item.quantity,
          })),
        });
      }

      return transaction.flashSale.findUniqueOrThrow({
        where: { id: flashSaleId },
        include: { items: { orderBy: { id: 'asc' } } },
      });
    });

    return this.toDomain(updated);
  }

  async cancelDraft(flashSaleId: bigint): Promise<FlashSaleEntity> {
    const cancelled = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.flashSale.updateMany({
        where: { id: flashSaleId, status: FlashSaleStatus.Draft },
        data: { status: FlashSaleStatus.Cancelled },
      });
      if (result.count === 0) {
        throw new FlashSaleNotDraftError();
      }

      return transaction.flashSale.findUniqueOrThrow({
        where: { id: flashSaleId },
        include: { items: { orderBy: { id: 'asc' } } },
      });
    });

    return this.toDomain(cancelled);
  }

  async scheduleDraft(request: ScheduleFlashSaleRequest): Promise<FlashSaleEntity> {
    assertValidDate(request.occurredAt);

    const scheduled = await this.prisma.$transaction(async (transaction) => {
      const [sale] = await transaction.$queryRaw<LockedFlashSaleRow[]>(Prisma.sql`
        SELECT "id", "starts_at", "ends_at", "status"::text
        FROM "flash_sales"
        WHERE "id" = ${request.flashSaleId}
        FOR UPDATE
      `);
      if (!sale) {
        throw new FlashSaleNotFoundError(request.flashSaleId);
      }
      if (sale.status !== FlashSaleStatus.Draft) {
        throw new FlashSaleNotDraftError();
      }
      validateScheduleTime(sale.starts_at, sale.ends_at, request.occurredAt);

      const items = await transaction.$queryRaw<ScheduledItemRow[]>(Prisma.sql`
        SELECT "id", "product_sku_id", "regular_price", "sale_price", "quantity"
        FROM "flash_sale_items"
        WHERE "flash_sale_id" = ${request.flashSaleId}
        ORDER BY "product_sku_id" ASC
      `);
      if (items.length === 0) {
        throw new InvalidFlashSaleError('A flash sale must have an item before scheduling.');
      }

      const skuIds = items.map((item) => item.product_sku_id);
      const skus = await transaction.$queryRaw<LockedSkuRow[]>(Prisma.sql`
        SELECT
          sku."id",
          sku."product_id",
          sku."price",
          sku."status"::text AS "sku_status",
          product_record."status"::text AS "product_status"
        FROM "product_skus" AS sku
        INNER JOIN "products" AS product_record ON product_record."id" = sku."product_id"
        WHERE sku."id" IN (${Prisma.join(skuIds)})
        ORDER BY sku."id" ASC
        FOR UPDATE OF sku
        FOR SHARE OF product_record
      `);
      const skusById = new Map(skus.map((sku) => [sku.id.toString(), sku]));

      for (const item of items) {
        const sku = skusById.get(item.product_sku_id.toString());
        if (!sku) {
          throw new FlashSaleNotFoundError(request.flashSaleId);
        }
        if (sku.product_status !== ProductStatus.Active) {
          throw new FlashSaleProductInactiveError(sku.product_id);
        }
        if (sku.sku_status !== ProductSkuStatus.Available) {
          throw new FlashSaleSkuInactiveError(sku.id);
        }
        if (!sku.price.equals(item.regular_price)) {
          throw new FlashSalePriceChangedError(sku.id);
        }
      }

      const overlapping = await transaction.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT existing_sale."id"
        FROM "flash_sales" AS existing_sale
        INNER JOIN "flash_sale_items" AS existing_item
          ON existing_item."flash_sale_id" = existing_sale."id"
        WHERE existing_sale."id" <> ${request.flashSaleId}
          AND existing_sale."status" = 'SCHEDULED'::"FlashSaleStatus"
          AND existing_sale."starts_at" < ${sale.ends_at}
          AND existing_sale."ends_at" > ${sale.starts_at}
          AND existing_item."product_sku_id" IN (${Prisma.join(skuIds)})
        LIMIT 1
      `);
      if (overlapping.length > 0) {
        throw new FlashSaleOverlapError();
      }

      const statusUpdate = await transaction.flashSale.updateMany({
        where: { id: request.flashSaleId, status: FlashSaleStatus.Draft },
        data: { status: FlashSaleStatus.Scheduled },
      });
      if (statusUpdate.count !== 1) {
        throw new FlashSaleNotDraftError();
      }

      await transaction.productOutboxEvent.create({
        data: {
          id: request.eventId,
          aggregateType: 'FLASH_SALE',
          aggregateId: request.flashSaleId,
          aggregateVersion: 1,
          eventType: 'FLASH_SALE_SCHEDULED',
          schemaVersion: 1,
          partitionKey: request.flashSaleId.toString(),
          occurredAt: request.occurredAt,
          payload: {
            flashSaleId: request.flashSaleId.toString(),
            startsAt: sale.starts_at.toISOString(),
            endsAt: sale.ends_at.toISOString(),
            items: items.map((item) => ({
              flashSaleItemId: item.id.toString(),
              productSkuId: item.product_sku_id.toString(),
              originalPrice: item.regular_price.toFixed(2),
              salePrice: item.sale_price.toFixed(2),
              quantity: item.quantity,
            })),
          },
        },
      });

      return transaction.flashSale.findUniqueOrThrow({
        where: { id: request.flashSaleId },
        include: { items: { orderBy: { id: 'asc' } } },
      });
    });

    return this.toDomain(scheduled);
  }

  private requireId(flashSale: FlashSaleEntity): bigint {
    if (flashSale.id === undefined) {
      throw new Error('A persisted flash sale ID is required.');
    }
    return flashSale.id;
  }

  private toDomain(flashSale: PrismaFlashSaleWithItems): FlashSaleEntity {
    return new FlashSaleEntity({
      id: flashSale.id,
      name: flashSale.name,
      description: flashSale.description,
      startsAt: flashSale.startsAt,
      endsAt: flashSale.endsAt,
      status: flashSale.status as FlashSaleStatus,
      items: flashSale.items.map(
        (item) =>
          new FlashSaleItemEntity({
            id: item.id,
            flashSaleId: item.flashSaleId,
            productSkuId: item.productSkuId,
            originalPrice: Number(item.originalPrice),
            salePrice: Number(item.salePrice),
            quantity: item.quantity,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          }),
      ),
      createdAt: flashSale.createdAt,
      updatedAt: flashSale.updatedAt,
    });
  }
}

function assertValidDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new FlashSaleScheduleTimeError('Scheduling time must be valid.');
  }
}

function validateScheduleTime(startsAt: Date, endsAt: Date, now: Date): void {
  if (startsAt.getTime() <= now.getTime()) {
    throw new FlashSaleScheduleTimeError('Flash sale must start in the future.');
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new FlashSaleScheduleTimeError('Flash sale duration must be positive.');
  }
}
