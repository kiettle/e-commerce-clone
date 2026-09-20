import { ProductEntity } from '../entities/product.entity';
import { ProductStatus } from '../enums/product-status.enum';

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

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
  findById(productId: bigint): Promise<ProductEntity | null>;
  search(filters: ProductSearchFilters): Promise<ProductEntity[]>;
  update(productId: bigint, data: ProductUpdateData): Promise<ProductEntity>;
  softDelete(productId: bigint): Promise<ProductEntity>;
}
