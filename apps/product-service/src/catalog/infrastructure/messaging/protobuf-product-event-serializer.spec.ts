import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtobufProductEventDeserializer } from '../../../../../inventory-service/src/inventory/infrastructure/messaging/protobuf-product-event-deserializer';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import { ProtobufProductEventSerializer } from './protobuf-product-event-serializer';

describe('ProtobufProductEventSerializer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encodes PRODUCT_CREATED and preserves product and SKU data', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    const serializer = new ProtobufProductEventSerializer();

    const decoded = serializer.decodeProductCreated(
      serializer.encodeProductCreated(productEvent()),
    );

    expect(decoded).toEqual({
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'PRODUCT_CREATED',
      productId: '20',
      name: 'Mechanical Keyboard',
      skus: [
        {
          productSkuId: '101',
          skuCode: 'KEYBOARD-BLACK',
          status: ProductSkuStatus.Available,
          quantity: '12',
        },
        {
          productSkuId: '102',
          skuCode: 'KEYBOARD-WHITE',
          status: ProductSkuStatus.OutOfStock,
          quantity: '0',
        },
      ],
    });
    expect(globalThis.crypto.randomUUID).toHaveBeenCalledOnce();
  });

  it('round-trips through the inventory deserializer', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'f46780ee-169f-4b92-9c6a-a41a5292c150',
    );
    const serializer = new ProtobufProductEventSerializer();
    const deserializer = new ProtobufProductEventDeserializer();

    expect(
      deserializer.decode(serializer.encodeProductCreated(productEvent())),
    ).toEqual({
      eventId: 'f46780ee-169f-4b92-9c6a-a41a5292c150',
      eventType: 'PRODUCT_CREATED',
      productCreated: {
        eventId: 'f46780ee-169f-4b92-9c6a-a41a5292c150',
        productId: 20n,
        name: 'Mechanical Keyboard',
        skus: [
          {
            productSkuId: 101n,
            skuCode: 'KEYBOARD-BLACK',
            status: ProductSkuStatus.Available,
            quantity: 12,
          },
          {
            productSkuId: 102n,
            skuCode: 'KEYBOARD-WHITE',
            status: ProductSkuStatus.OutOfStock,
            quantity: 0,
          },
        ],
      },
    });
  });

  function productEvent() {
    return {
      productId: 20n,
      name: 'Mechanical Keyboard',
      skus: [
        {
          productSkuId: 101n,
          skuCode: 'KEYBOARD-BLACK',
          status: ProductSkuStatus.Available,
          quantity: 12,
        },
        {
          productSkuId: 102n,
          skuCode: 'KEYBOARD-WHITE',
          status: ProductSkuStatus.OutOfStock,
          quantity: 0,
        },
      ],
    };
  }
});
