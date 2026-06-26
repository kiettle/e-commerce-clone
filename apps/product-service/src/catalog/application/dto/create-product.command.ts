import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import { ProductStatus } from '../../domain/enums/product-status.enum';

export interface CreateProductSkuCommand {
  skuCode: string;
  price: number;
  status: ProductSkuStatus;
  quantity: number;
}

export interface CreateProductCommand {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  categoryId: bigint;
  sellerId: bigint;
  status: ProductStatus;
  skus: CreateProductSkuCommand[];
}
