import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import { ProductStatus } from '../../domain/enums/product-status.enum';

export const PRODUCT_CREATION_REPOSITORY = Symbol('PRODUCT_CREATION_REPOSITORY');

export interface ProductSkuCreationData {
  skuCode: string;
  price: number;
  status: ProductSkuStatus;
  quantity: number;
}

export interface ProductCreationData {
  eventId: string;
  occurredAt: Date;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  categoryId: bigint;
  sellerId: bigint;
  status: ProductStatus;
  skus: ProductSkuCreationData[];
}

export interface ProductCreationRepositoryPort {
  createWithOutbox(data: ProductCreationData): Promise<ProductEntity>;
}
