import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtobufProductEventDeserializer } from '../../../../../inventory-service/src/inventory/infrastructure/messaging/protobuf-product-event-deserializer';
import { InvalidProductEventError } from '../../application/errors/invalid-product-event.error';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import {
  ProtobufProductEventSerializer,
  StoredProductEventEnvelope,
} from './protobuf-product-event-serializer';

describe('ProtobufProductEventSerializer', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('produces identical bytes for the same stored event', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-09-20T09:00:00.000Z');
    const randomUuid = vi.spyOn(globalThis.crypto, 'randomUUID');
    const serializer = new ProtobufProductEventSerializer();
    const event = storedEvent();

    const first = serializer.encode(event);
    vi.setSystemTime('2026-09-21T09:00:00.000Z');
    const second = serializer.encode(event);

    expect(first.equals(second)).toBe(true);
    expect(randomUuid).not.toHaveBeenCalled();
  });

  it('preserves stored identity, occurrence time, schema version, and payload', () => {
    const serializer = new ProtobufProductEventSerializer();
    const event = storedEvent();

    expect(serializer.decodeProductCreated(serializer.encode(event))).toEqual({
      eventId: event.eventId,
      eventType: 'PRODUCT_CREATED',
      schemaVersion: 1,
      occurredAt: event.occurredAt,
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
  });

  it('preserves int64 IDs larger than JavaScript safe integers', () => {
    const serializer = new ProtobufProductEventSerializer();
    const event = storedEvent();
    event.payload.productId = '9223372036854775807';
    event.payload.skus = [
      {
        productSkuId: '9007199254740993',
        skuCode: 'LARGE-ID-SKU',
        status: ProductSkuStatus.Available,
        quantity: 1,
      },
    ];

    const decoded = serializer.decodeProductCreated(serializer.encode(event));

    expect(decoded.productId).toBe('9223372036854775807');
    expect(decoded.skus[0].productSkuId).toBe('9007199254740993');
  });

  it('round-trips through the inventory deserializer', () => {
    const serializer = new ProtobufProductEventSerializer();
    const deserializer = new ProtobufProductEventDeserializer();
    const event = storedEvent();

    expect(deserializer.decode(serializer.encode(event))).toEqual({
      eventId: event.eventId,
      eventType: 'PRODUCT_CREATED',
      productCreated: {
        eventId: event.eventId,
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

  it('rejects unsupported event types', () => {
    const serializer = new ProtobufProductEventSerializer();

    expect(() => serializer.encode({ ...storedEvent(), eventType: 'PRODUCT_UPDATED' })).toThrow(
      'Unsupported product event type',
    );
  });

  it('rejects unsupported schema versions', () => {
    const serializer = new ProtobufProductEventSerializer();

    expect(() => serializer.encode({ ...storedEvent(), schemaVersion: 2 })).toThrow(
      'Unsupported PRODUCT_CREATED schema version',
    );
  });

  it('rejects malformed stored payloads', () => {
    const serializer = new ProtobufProductEventSerializer();

    expect(() =>
      serializer.encode({ ...storedEvent(), payload: { productId: '20' } }),
    ).toThrowError(InvalidProductEventError);
  });

  function storedEvent(): StoredProductEventEnvelope {
    return {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'PRODUCT_CREATED',
      schemaVersion: 1,
      occurredAt: new Date('2026-09-20T08:00:00.123Z'),
      payload: {
        productId: '20',
        name: 'Mechanical Keyboard',
        skus: [
          {
            productSkuId: '101',
            skuCode: 'KEYBOARD-BLACK',
            status: ProductSkuStatus.Available,
            quantity: 12,
          },
          {
            productSkuId: '102',
            skuCode: 'KEYBOARD-WHITE',
            status: ProductSkuStatus.OutOfStock,
            quantity: 0,
          },
        ],
      },
    };
  }
});
