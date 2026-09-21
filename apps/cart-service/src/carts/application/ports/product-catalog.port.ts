export const PRODUCT_CATALOG = Symbol('PRODUCT_CATALOG');

export interface ProductSkuSnapshot {
  productId: bigint;
  productName: string;
  imageUrl?: string | null;
  productSkuId: bigint;
  skuCode: string;
  price: number;
  regularPrice: number;
  priceSource: 'REGULAR' | 'FLASH_SALE';
  flashSaleId: bigint | null;
  flashSaleItemId: bigint | null;
  saleEndsAt: Date | null;
  maxPerUserQuantity: number | null;
}

export interface ProductCatalogPort {
  getProductSkuSnapshot(productSkuId: bigint): Promise<ProductSkuSnapshot | null>;
}
