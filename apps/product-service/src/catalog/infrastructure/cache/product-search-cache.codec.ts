import { createHash } from 'node:crypto';
import { SearchProductsQuery } from '../../application/dto/search-products.query';
import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductSkuEntity } from '../../domain/entities/product-sku.entity';
import { ProductStatus } from '../../domain/enums/product-status.enum';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';

export const MAX_PRODUCT_CACHE_BYTES = 256 * 1024;

export function productSearchCacheKey(query: SearchProductsQuery): string {
  const filters = JSON.stringify({
    name: query.name || null,
    categoryId: query.categoryId?.toString() ?? null,
  });
  return `product-service:catalog-search:v1:${createHash('sha256').update(filters).digest('hex')}`;
}

export function encodeProducts(products: ProductEntity[]): string {
  return JSON.stringify(products, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

export function decodeProducts(payload: string): ProductEntity[] {
  if (Buffer.byteLength(payload) > MAX_PRODUCT_CACHE_BYTES) {
    throw new Error('Cache entry exceeds size limit.');
  }
  const value: unknown = JSON.parse(payload);
  if (!Array.isArray(value)) {
    throw new Error('Invalid cached product list.');
  }
  return value.map((item: unknown) => {
    const product = record(item);
    if (!Array.isArray(product.skus)) {
      throw new Error('Invalid cached SKUs.');
    }
    return new ProductEntity({
      id: id(product.id),
      name: text(product.name),
      description: nullableText(product.description),
      imageUrl: nullableText(product.imageUrl),
      categoryId: id(product.categoryId),
      sellerId: id(product.sellerId),
      status: enumValue(product.status, ProductStatus),
      createdAt: date(product.createdAt),
      updatedAt: date(product.updatedAt),
      skus: product.skus.map((item: unknown) => {
        const sku = record(item);
        if (typeof sku.price !== 'number' || !Number.isFinite(sku.price) || sku.price < 0) {
          throw new Error('Invalid cached price.');
        }
        return new ProductSkuEntity({
          id: id(sku.id),
          productId: id(sku.productId),
          skuCode: text(sku.skuCode),
          price: sku.price,
          status: enumValue(sku.status, ProductSkuStatus),
          createdAt: date(sku.createdAt),
          updatedAt: date(sku.updatedAt),
        });
      }),
    });
  });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid cached object.');
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid cached string.');
  return value;
}

function nullableText(value: unknown): string | null | undefined {
  return value == null ? value : text(value);
}

function id(value: unknown): bigint {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new Error('Invalid cached ID.');
  }
  return BigInt(value);
}

function date(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  const parsed = new Date(text(value));
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error('Invalid cached date.');
  }
  return parsed;
}

function enumValue<T extends string>(value: unknown, values: Record<string, T>): T {
  if (!Object.values(values).includes(value as T)) throw new Error('Invalid cached status.');
  return value as T;
}
