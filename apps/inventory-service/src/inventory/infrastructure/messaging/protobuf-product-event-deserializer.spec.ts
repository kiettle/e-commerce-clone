import { join } from 'node:path';
import * as protobuf from 'protobufjs';
import { ProtobufProductEventDeserializer } from './protobuf-product-event-deserializer';

describe('ProtobufProductEventDeserializer', () => {
  it('decodes a ProductCreated payload', () => {
    const buffer = encodeProductEvent({
      eventId: 'event-1',
      eventType: 0,
      productCreated: {
        productId: 1,
        name: 'Running Shoes',
        skus: [
          {
            productSkuId: 10,
            skuCode: 'SHOE-BLACK-42',
            status: 'AVAILABLE',
            quantity: 100,
          },
        ],
      },
    });

    const decoded = new ProtobufProductEventDeserializer().decode(buffer);

    expect(decoded).toEqual({
      eventId: 'event-1',
      eventType: 'PRODUCT_CREATED',
      productCreated: {
        eventId: 'event-1',
        productId: 1n,
        name: 'Running Shoes',
        skus: [
          {
            productSkuId: 10n,
            skuCode: 'SHOE-BLACK-42',
            status: 'AVAILABLE',
            quantity: 100,
          },
        ],
      },
    });
  });

  it('returns unsupported events without a productCreated payload', () => {
    const buffer = encodeProductEvent({
      eventId: 'event-2',
      eventType: 1,
      productSkuAdded: {
        productId: 1,
        sku: {
          productSkuId: 11,
          skuCode: 'SHOE-WHITE-42',
          status: 'AVAILABLE',
          quantity: 10,
        },
      },
    });

    const decoded = new ProtobufProductEventDeserializer().decode(buffer);

    expect(decoded).toEqual({
      eventId: 'event-2',
      eventType: 'PRODUCT_SKU_ADDED',
    });
  });
});

function encodeProductEvent(payload: Record<string, unknown>): Buffer {
  const root = protobuf.loadSync(join(process.cwd(), 'libs/proto/product_event.proto'));
  const productEventType = root.lookupType('product.events.ProductEvent');
  const verificationError = productEventType.verify(payload);

  if (verificationError) {
    throw new Error(verificationError);
  }

  return Buffer.from(
    productEventType.encode(productEventType.create(payload)).finish(),
  );
}
