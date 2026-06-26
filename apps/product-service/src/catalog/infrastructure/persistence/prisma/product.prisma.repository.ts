import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Product as PrismaProduct,
  ProductSku as PrismaProductSku,
} from '../../../../../../../prisma/generated/product';
import { ProductEntity } from '../../../domain/entities/product.entity';
import { ProductSkuEntity } from '../../../domain/entities/product-sku.entity';
import { ProductSkuStatus } from '../../../domain/enums/product-sku-status.enum';
import { ProductStatus } from '../../../domain/enums/product-status.enum';
import {
  ProductCreateData,
  ProductRepositoryPort,
  ProductSearchFilters,
  ProductUpdateData,
} from '../../../domain/repositories/product.repository.port';
import { PrismaService } from './prisma.service';

type PrismaProductWithSkus = PrismaProduct & {
  skus: PrismaProductSku[];
};

@Injectable()
export class PrismaProductRepository implements ProductRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: ProductCreateData): Promise<ProductEntity> {
    const product = await this.prisma.$transaction(async (transaction) => {
      const createdProduct = await transaction.product.create({
        data: {
          name: data.name,
          description: data.description,
          imageUrl: data.imageUrl,
          categoryId: data.categoryId,
          sellerId: data.sellerId,
          status: data.status,
        },
      });

      const skus = await Promise.all(
        data.skus.map((sku) =>
          transaction.productSku.create({
            data: {
              productId: createdProduct.id,
              skuCode: sku.skuCode,
              price: sku.price,
              status: sku.status,
            },
          }),
        ),
      );

      return { ...createdProduct, skus };
    });

    return this.toDomain(product);
  }

  async findById(productId: bigint): Promise<ProductEntity | null> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { skus: true },
    });

    return product ? this.toDomain(product) : null;
  }

  async search(filters: ProductSearchFilters): Promise<ProductEntity[]> {
    const where: Prisma.ProductWhereInput = {
      status: { not: ProductStatus.Deleted },
    };

    if (filters.name) {
      where.name = {
        contains: filters.name,
        mode: 'insensitive',
      };
    }

    if (filters.categoryId !== undefined) {
      where.categoryId = filters.categoryId;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: { skus: true },
      orderBy: { id: 'asc' },
    });

    return products.map((product) => this.toDomain(product));
  }

  async update(productId: bigint, data: ProductUpdateData): Promise<ProductEntity> {
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: removeUndefinedProperties({
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
        categoryId: data.categoryId,
        status: data.status,
      }),
      include: { skus: true },
    });

    return this.toDomain(product);
  }

  async softDelete(productId: bigint): Promise<ProductEntity> {
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { status: ProductStatus.Deleted },
      include: { skus: true },
    });

    return this.toDomain(product);
  }

  private toDomain(product: PrismaProductWithSkus): ProductEntity {
    return new ProductEntity({
      id: product.id,
      name: product.name,
      description: product.description,
      imageUrl: product.imageUrl,
      categoryId: product.categoryId,
      sellerId: product.sellerId,
      status: product.status as ProductStatus,
      skus: product.skus.map((sku) => this.toSkuDomain(sku)),
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    });
  }

  private toSkuDomain(sku: PrismaProductSku): ProductSkuEntity {
    return new ProductSkuEntity({
      id: sku.id,
      productId: sku.productId,
      skuCode: sku.skuCode,
      price: Number(sku.price),
      status: sku.status as ProductSkuStatus,
      createdAt: sku.createdAt,
      updatedAt: sku.updatedAt,
    });
  }
}

function removeUndefinedProperties<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, propertyValue]) => propertyValue !== undefined),
  ) as T;
}
