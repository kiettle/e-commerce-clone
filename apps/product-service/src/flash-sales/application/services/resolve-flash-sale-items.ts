import { FlashSaleItemEntity } from '../../domain/entities/flash-sale-item.entity';
import { InvalidFlashSaleError } from '../../domain/errors/invalid-flash-sale.error';
import { FlashSaleSkuInactiveError } from '../../domain/errors/flash-sale-sku-inactive.error';
import { FlashSaleSkuNotFoundError } from '../../domain/errors/flash-sale-sku-not-found.error';
import { FlashSaleRepositoryPort } from '../../domain/repositories/flash-sale.repository.port';
import { FlashSaleItemCommand } from '../dto/flash-sale.command';

export async function resolveFlashSaleItems(
  requestedItems: FlashSaleItemCommand[],
  flashSales: FlashSaleRepositoryPort,
): Promise<FlashSaleItemEntity[]> {
  const requestedSkuIds = requestedItems.map((item) => item.productSkuId);
  rejectDuplicateSkuIds(requestedSkuIds);

  if (requestedSkuIds.length === 0) {
    return [];
  }

  const skus = await flashSales.findSkusByIds(requestedSkuIds);
  const skusById = new Map(skus.map((sku) => [sku.id.toString(), sku]));

  return requestedItems.map((item) => {
    const sku = skusById.get(item.productSkuId.toString());
    if (!sku) {
      throw new FlashSaleSkuNotFoundError(item.productSkuId);
    }
    if (!sku.active) {
      throw new FlashSaleSkuInactiveError(item.productSkuId);
    }

    return new FlashSaleItemEntity({
      productSkuId: item.productSkuId,
      originalPrice: sku.price,
      salePrice: item.salePrice,
      quantity: item.quantity,
    });
  });
}

function rejectDuplicateSkuIds(productSkuIds: bigint[]): void {
  const uniqueIds = new Set(productSkuIds.map(String));
  if (uniqueIds.size !== productSkuIds.length) {
    throw new InvalidFlashSaleError('A product SKU can appear only once in a flash sale.');
  }
}
