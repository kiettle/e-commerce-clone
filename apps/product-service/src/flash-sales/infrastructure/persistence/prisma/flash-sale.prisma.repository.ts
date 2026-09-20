import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../../../prisma/generated/product';
import { ProductSkuStatus } from '../../../../catalog/domain/enums/product-sku-status.enum';
import { PrismaService } from '../../../../catalog/infrastructure/persistence/prisma/prisma.service';
import { FlashSaleItemEntity } from '../../../domain/entities/flash-sale-item.entity';
import { FlashSaleEntity } from '../../../domain/entities/flash-sale.entity';
import { FlashSaleStatus } from '../../../domain/enums/flash-sale-status.enum';
import { FlashSaleNotDraftError } from '../../../domain/errors/flash-sale-not-draft.error';
import {
  FlashSaleRepositoryPort,
  FlashSaleSkuReference,
} from '../../../domain/repositories/flash-sale.repository.port';

type PrismaFlashSaleWithItems = Prisma.FlashSaleGetPayload<{
  include: { items: true };
}>;

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
