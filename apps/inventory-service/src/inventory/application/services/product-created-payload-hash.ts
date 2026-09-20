import { createHash } from 'node:crypto';
import { HandleProductCreatedCommand } from '../dto/handle-product-created.command';

export function calculateProductCreatedPayloadHash(command: HandleProductCreatedCommand): string {
  const canonicalPayload = {
    schemaVersion: command.schemaVersion,
    eventType: 'PRODUCT_CREATED',
    productId: command.productId.toString(),
    name: command.name,
    skus: [...command.skus]
      .sort((left, right) => compareBigInt(left.productSkuId, right.productSkuId))
      .map((sku) => ({
        productSkuId: sku.productSkuId.toString(),
        skuCode: sku.skuCode,
        status: sku.status,
        quantity: sku.quantity,
      })),
  };

  return createHash('sha256').update(JSON.stringify(canonicalPayload), 'utf8').digest('hex');
}

function compareBigInt(left: bigint, right: bigint): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
