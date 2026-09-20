export const PRODUCT_SKU_SNAPSHOT_REPOSITORY = Symbol('PRODUCT_SKU_SNAPSHOT_REPOSITORY');

export interface StoredProductSkuSnapshot {
  productId: bigint;
  productName: string;
  imageUrl: string | null;
  productSkuId: bigint;
  skuCode: string;
  regularPrice: number;
  activeSalePrice: number | null;
}

export interface ProductSkuSnapshotRepositoryPort {
  findEffectiveSnapshot(productSkuId: bigint, at: Date): Promise<StoredProductSkuSnapshot | null>;
}
