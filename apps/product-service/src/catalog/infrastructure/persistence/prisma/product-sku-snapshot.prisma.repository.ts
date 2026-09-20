import { Injectable } from '@nestjs/common';
import {
  ProductSkuSnapshotRepositoryPort,
  StoredProductSkuSnapshot,
} from '../../../application/ports/product-sku-snapshot.repository.port';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaProductSkuSnapshotRepository implements ProductSkuSnapshotRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findEffectiveSnapshot(
    productSkuId: bigint,
    at: Date,
  ): Promise<StoredProductSkuSnapshot | null> {
    const sku = await this.prisma.productSku.findUnique({
      where: { id: productSkuId },
      select: {
        id: true,
        productId: true,
        skuCode: true,
        price: true,
        product: { select: { name: true, imageUrl: true } },
        flashSaleItems: {
          where: {
            flashSale: {
              status: 'SCHEDULED',
              startsAt: { lte: at },
              endsAt: { gt: at },
            },
          },
          select: { salePrice: true },
          take: 2,
        },
      },
    });

    if (!sku) {
      return null;
    }
    if (sku.flashSaleItems.length > 1) {
      throw new Error(`Product SKU ${productSkuId} has more than one active flash sale.`);
    }

    return {
      productId: sku.productId,
      productName: sku.product.name,
      imageUrl: sku.product.imageUrl,
      productSkuId: sku.id,
      skuCode: sku.skuCode,
      regularPrice: Number(sku.price),
      activeSalePrice:
        sku.flashSaleItems.length === 1 ? Number(sku.flashSaleItems[0].salePrice) : null,
    };
  }
}
