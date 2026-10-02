import { join } from 'node:path';
import { loadSync } from 'protobufjs';
import { describe, expect, it } from 'vitest';

describe('order protobuf contract', () => {
  const root = loadSync(join(process.cwd(), 'libs/proto/order.proto'));

  it('keeps order creation and checkout lookup RPCs', () => {
    const service = root.lookupService('order.OrderService');

    expect(Object.keys(service.methods).sort()).toEqual(['CreateOrder', 'GetOrderByCheckoutId']);
    expect(root.lookupType('order.GetOrderByCheckoutIdRequest').fields.checkoutId.id).toBe(1);
  });

  it('preserves create request fields and appends the hash version', () => {
    const request = root.lookupType('order.CreateOrderRequest');

    expect(request.fields.userId.id).toBe(1);
    expect(request.fields.items.id).toBe(2);
    expect(request.fields.checkoutId.id).toBe(3);
    expect(request.fields.cartId.id).toBe(4);
    expect(request.fields.requestHash.id).toBe(5);
    expect(request.fields.requestHashVersion.id).toBe(6);
  });

  it('preserves order item fields and appends sale snapshot context', () => {
    const item = root.lookupType('order.CreateOrderItem');

    expect(item.fields.productSkuId.id).toBe(1);
    expect(item.fields.productName.id).toBe(2);
    expect(item.fields.price.id).toBe(3);
    expect(item.fields.quantity.id).toBe(4);
    expect(item.fields.skuCode.id).toBe(5);
    expect(item.fields.imageUrl.id).toBe(6);
    expect(item.fields.regularPrice.id).toBe(7);
    expect(item.fields.priceSource.id).toBe(8);
    expect(item.fields.flashSaleId.id).toBe(9);
    expect(item.fields.flashSaleItemId.id).toBe(10);
    expect(item.fields.saleEndsAt.id).toBe(11);
  });
});
