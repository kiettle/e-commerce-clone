import { join } from 'node:path';
import { loadSync } from 'protobufjs';
import { describe, expect, it } from 'vitest';

describe('inventory protobuf contract', () => {
  const root = loadSync(join(process.cwd(), 'libs/proto/inventory.proto'));

  it('preserves existing fields and appends operation identity', () => {
    const request = root.lookupType('inventory.StockOperationRequest');

    expect(request.fields.cartId.id).toBe(1);
    expect(request.fields.items.id).toBe(2);
    expect(request.fields.checkoutId.id).toBe(3);
    expect(request.fields.userId.id).toBe(4);
  });

  it('preserves existing item fields and appends optional sale context', () => {
    const item = root.lookupType('inventory.StockItem');

    expect(item.fields.productSkuId.id).toBe(1);
    expect(item.fields.quantity.id).toBe(2);
    expect(item.fields.flashSaleId.id).toBe(3);
    expect(item.fields.flashSaleItemId.id).toBe(4);
    expect(item.fields.flashSaleId.optional).toBe(true);
    expect(item.fields.flashSaleItemId.optional).toBe(true);
  });
});
