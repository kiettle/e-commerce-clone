import { createHash } from 'node:crypto';
import { HandleFlashSaleScheduledCommand } from '../dto/handle-flash-sale-scheduled.command';

export function calculateFlashSaleScheduledPayloadHash(
  command: HandleFlashSaleScheduledCommand,
): string {
  const canonicalPayload = {
    schemaVersion: command.schemaVersion,
    eventType: 'FLASH_SALE_SCHEDULED',
    flashSaleId: command.flashSaleId.toString(),
    startsAt: command.startsAt.toISOString(),
    endsAt: command.endsAt.toISOString(),
    items: [...command.items]
      .sort((left, right) => compareBigInt(left.flashSaleItemId, right.flashSaleItemId))
      .map((item) => ({
        flashSaleItemId: item.flashSaleItemId.toString(),
        productSkuId: item.productSkuId.toString(),
        originalPrice: item.originalPrice,
        salePrice: item.salePrice,
        quantityLimit: item.quantityLimit,
      })),
  };

  return createHash('sha256').update(JSON.stringify(canonicalPayload), 'utf8').digest('hex');
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
