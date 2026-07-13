import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductSnapshotUnavailableError } from '../../domain/errors/product-snapshot-unavailable.error';
import {
  ProductCatalogPort,
  ProductSkuSnapshot,
} from '../../application/ports/product-catalog.port';

interface ProductResponse {
  id: number;
  name: string;
  imageUrl?: string | null;
  skus: Array<{
    id: number;
    skuCode: string;
    price: number;
  }>;
}

@Injectable()
export class ProductHttpCatalogClient implements ProductCatalogPort {
  constructor(private readonly configService: ConfigService) {}

  async getProductSkuSnapshot(
    productSkuId: bigint,
  ): Promise<ProductSkuSnapshot | null> {
    const products = await this.fetchProducts();

    for (const product of products) {
      const sku = product.skus.find(
        (candidate) => BigInt(candidate.id) === productSkuId,
      );

      if (sku) {
        return {
          productId: BigInt(product.id),
          productName: product.name,
          imageUrl: product.imageUrl,
          productSkuId,
          skuCode: sku.skuCode,
          price: sku.price,
        };
      }
    }

    return null;
  }

  private async fetchProducts(): Promise<ProductResponse[]> {
    const baseUrl = this.getProductServiceUrl();

    try {
      const response = await fetch(`${baseUrl}/api/products`);

      if (!response.ok) {
        throw new ProductSnapshotUnavailableError(
          `Product service returned ${response.status}.`,
        );
      }

      return (await response.json()) as ProductResponse[];
    } catch (error) {
      if (error instanceof ProductSnapshotUnavailableError) {
        throw error;
      }

      throw new ProductSnapshotUnavailableError(
        'Product service request failed.',
      );
    }
  }

  private getProductServiceUrl(): string {
    const url =
      this.configService.get<string>('PRODUCT_SERVICE_URL') ??
      'http://localhost:4001';

    return url.replace(/\/$/, '');
  }
}
