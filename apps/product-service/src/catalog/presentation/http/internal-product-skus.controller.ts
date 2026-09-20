import { BadRequestException, Controller, Get, NotFoundException, Param } from '@nestjs/common';
import {
  GetProductSkuSnapshotUseCase,
  ProductPriceSource,
} from '../../application/use-cases/get-product-sku-snapshot.use-case';

interface ProductSkuSnapshotResponse {
  productId: string;
  productName: string;
  imageUrl: string | null;
  productSkuId: string;
  skuCode: string;
  regularPrice: number;
  effectivePrice: number;
  priceSource: ProductPriceSource;
}

@Controller('internal/product-skus')
export class InternalProductSkusController {
  constructor(private readonly getSnapshot: GetProductSkuSnapshotUseCase) {}

  @Get(':productSkuId/snapshot')
  async get(@Param('productSkuId') rawProductSkuId: string): Promise<ProductSkuSnapshotResponse> {
    const productSkuId = parsePositiveId(rawProductSkuId);
    const snapshot = await this.getSnapshot.execute(productSkuId);
    if (!snapshot) {
      throw new NotFoundException(`Product SKU ${productSkuId} was not found.`);
    }

    return {
      ...snapshot,
      productId: snapshot.productId.toString(),
      productSkuId: snapshot.productSkuId.toString(),
    };
  }
}

function parsePositiveId(value: string): bigint {
  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) {
    throw new BadRequestException('Product SKU ID must be a positive integer.');
  }
  return BigInt(value);
}
