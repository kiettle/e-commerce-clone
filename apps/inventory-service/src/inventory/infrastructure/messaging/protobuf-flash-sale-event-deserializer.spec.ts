import { describe, expect, it } from 'vitest';
import { ProtobufFlashSaleEventSerializer } from '../../../../../product-service/src/catalog/infrastructure/messaging/protobuf-flash-sale-event-serializer';
import { ProtobufFlashSaleEventDeserializer } from './protobuf-flash-sale-event-deserializer';

describe('ProtobufFlashSaleEventDeserializer', () => {
  it('preserves the scheduled sale snapshot and large int64 identifiers', () => {
    const bytes = new ProtobufFlashSaleEventSerializer().encode({
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'FLASH_SALE_SCHEDULED',
      schemaVersion: 1,
      occurredAt: new Date('2026-09-20T08:00:00.000Z'),
      payload: {
        flashSaleId: '9007199254740993',
        startsAt: '2026-10-01T08:00:00.000Z',
        endsAt: '2026-10-01T10:00:00.000Z',
        items: [
          {
            flashSaleItemId: '9007199254740995',
            productSkuId: '9007199254740997',
            stockLimit: 25,
            maxQuantityPerUser: 1,
          },
        ],
      },
    });

    expect(new ProtobufFlashSaleEventDeserializer().decode(bytes)).toEqual({
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'FLASH_SALE_SCHEDULED',
      schemaVersion: 1,
      flashSaleScheduled: {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        schemaVersion: 1,
        flashSaleId: 9007199254740993n,
        startsAt: new Date('2026-10-01T08:00:00.000Z'),
        endsAt: new Date('2026-10-01T10:00:00.000Z'),
        items: [
          {
            flashSaleItemId: 9007199254740995n,
            productSkuId: 9007199254740997n,
            stockLimit: 25,
            maxQuantityPerUser: 1,
          },
        ],
      },
    });
  });
});
