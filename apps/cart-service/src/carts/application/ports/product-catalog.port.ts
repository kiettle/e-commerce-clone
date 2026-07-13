export const PRODUCT_CATALOG = Symbol('PRODUCT_CATALOG');

export interface ProductSkuSnapshot {
  productId: bigint;
  productName: string;
  imageUrl?: string | null;
  productSkuId: bigint;
  skuCode: string;
  price: number;
}

export interface ProductCatalogPort {
  getProductSkuSnapshot(
    productSkuId: bigint,
  ): Promise<ProductSkuSnapshot | null>;
}
