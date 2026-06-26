import { ProductEntity } from '../entities/product.entity';
import { ProductSkuStatus } from '../enums/product-sku-status.enum';
import { ProductStatus } from '../enums/product-status.enum';

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

export interface ProductSkuCreateData {
  skuCode: string;
  price: number;
  status: ProductSkuStatus;
}

export interface ProductCreateData {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  categoryId: bigint;
  sellerId: bigint;
  status: ProductStatus;
  skus: ProductSkuCreateData[];
}

export interface ProductUpdateData {
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
  categoryId?: bigint;
  status?: ProductStatus;
}

export interface ProductSearchFilters {
  name?: string;
  categoryId?: bigint;
}

export interface ProductRepositoryPort {
  create(data: ProductCreateData): Promise<ProductEntity>;
  findById(productId: bigint): Promise<ProductEntity | null>;
  search(filters: ProductSearchFilters): Promise<ProductEntity[]>;
  update(productId: bigint, data: ProductUpdateData): Promise<ProductEntity>;
  softDelete(productId: bigint): Promise<ProductEntity>;
}
