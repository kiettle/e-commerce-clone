import { ProductSkuSnapshotRepositoryPort } from '../ports/product-sku-snapshot.repository.port';

export enum ProductPriceSource {
  Regular = 'REGULAR',
  FlashSale = 'FLASH_SALE',
}

export interface EffectiveProductSkuSnapshot {
  productId: bigint;
  productName: string;
  imageUrl: string | null;
  productSkuId: bigint;
  skuCode: string;
  regularPrice: number;
  effectivePrice: number;
  priceSource: ProductPriceSource;
  flashSaleId: bigint | null;
  flashSaleItemId: bigint | null;
}

export class GetProductSkuSnapshotUseCase {
  constructor(
    private readonly snapshots: ProductSkuSnapshotRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(productSkuId: bigint): Promise<EffectiveProductSkuSnapshot | null> {
    const snapshot = await this.snapshots.findEffectiveSnapshot(productSkuId, this.now());
    if (!snapshot) {
      return null;
    }

    const hasActiveSale = snapshot.activeSalePrice !== null;
    return {
      productId: snapshot.productId,
      productName: snapshot.productName,
      imageUrl: snapshot.imageUrl,
      productSkuId: snapshot.productSkuId,
      skuCode: snapshot.skuCode,
      regularPrice: snapshot.regularPrice,
      effectivePrice: hasActiveSale ? snapshot.activeSalePrice! : snapshot.regularPrice,
      priceSource: hasActiveSale ? ProductPriceSource.FlashSale : ProductPriceSource.Regular,
      flashSaleId: snapshot.flashSaleId,
      flashSaleItemId: snapshot.flashSaleItemId,
    };
  }
}
