import { CategoryEntity } from '../../domain/entities/category.entity';
import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductSkuEntity } from '../../domain/entities/product-sku.entity';

export interface CategoryResponse {
  id: number;
  name: string;
  slug: string;
}

export interface ProductSkuResponse {
  id: number;
  productId: number;
  skuCode: string;
  price: number;
  status: string;
}

export interface ProductResponse {
  id: number;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  categoryId: number;
  sellerId: number;
  status: string;
  skus: ProductSkuResponse[];
}

export function toCategoryResponse(category: CategoryEntity): CategoryResponse {
  return {
    id: Number(category.id),
    name: category.name,
    slug: category.slug,
  };
}

export function toProductResponse(product: ProductEntity): ProductResponse {
  return {
    id: Number(product.id),
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    categoryId: Number(product.categoryId),
    sellerId: Number(product.sellerId),
    status: product.status,
    skus: product.skus.map(toProductSkuResponse),
  };
}

function toProductSkuResponse(sku: ProductSkuEntity): ProductSkuResponse {
  return {
    id: Number(sku.id),
    productId: Number(sku.productId),
    skuCode: sku.skuCode,
    price: sku.price,
    status: sku.status,
  };
}
