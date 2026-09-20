import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductSnapshotUnavailableError } from '../../domain/errors/product-snapshot-unavailable.error';
import {
  ProductCatalogPort,
  ProductSkuSnapshot,
} from '../../application/ports/product-catalog.port';

interface ProductSkuSnapshotResponse {
  productId: string;
  productName: string;
  imageUrl?: string | null;
  productSkuId: string;
  skuCode: string;
  regularPrice: number;
  effectivePrice: number;
  priceSource: 'REGULAR' | 'FLASH_SALE';
}

@Injectable()
export class ProductHttpCatalogClient implements ProductCatalogPort {
  constructor(private readonly configService: ConfigService) {}

  async getProductSkuSnapshot(productSkuId: bigint): Promise<ProductSkuSnapshot | null> {
    const baseUrl = this.getProductServiceUrl();

    try {
      const response = await fetch(
        `${baseUrl}/internal/product-skus/${productSkuId.toString()}/snapshot`,
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new ProductSnapshotUnavailableError(`Product service returned ${response.status}.`);
      }

      const snapshot = (await response.json()) as ProductSkuSnapshotResponse;
      return {
        productId: BigInt(snapshot.productId),
        productName: snapshot.productName,
        imageUrl: snapshot.imageUrl,
        productSkuId: BigInt(snapshot.productSkuId),
        skuCode: snapshot.skuCode,
        price: snapshot.effectivePrice,
        regularPrice: snapshot.regularPrice,
        priceSource: snapshot.priceSource,
      };
    } catch (error) {
      if (error instanceof ProductSnapshotUnavailableError) {
        throw error;
      }

      throw new ProductSnapshotUnavailableError('Product service request failed.');
    }
  }

  private getProductServiceUrl(): string {
    const url = this.configService.get<string>('PRODUCT_SERVICE_URL') ?? 'http://localhost:4001';

    return url.replace(/\/$/, '');
  }
}
