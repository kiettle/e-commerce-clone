import { describe, expect, it } from 'vitest';
import { ProtobufFlashSaleEventSerializer } from './protobuf-flash-sale-event-serializer';

describe('ProtobufFlashSaleEventSerializer', () => {
  const serializer = new ProtobufFlashSaleEventSerializer();

  it('encodes a stored flash sale envelope deterministically', () => {
    const event = flashSaleEvent();

    const first = serializer.encode(event);
    const second = serializer.encode(event);
    const decoded = serializer.decode(first);

    expect(first.equals(second)).toBe(true);
    expect(decoded).toMatchObject({
      eventId: event.eventId,
      eventType: 'FLASH_SALE_SCHEDULED',
      schemaVersion: 1,
      flashSaleScheduled: {
        flashSaleId: '9007199254740993',
        items: [
          {
            flashSaleItemId: '9007199254740995',
            productSkuId: '9007199254740997',
            quantityLimit: 25,
          },
        ],
      },
    });
    expect(timestampDate(decoded.occurredAt)).toEqual(event.occurredAt);
    expect(timestampDate(decoded.flashSaleScheduled?.startsAt)).toEqual(
      new Date('2026-10-01T08:00:00.000Z'),
    );
  });

  it('rejects an invalid stored payload before publication', () => {
    expect(() =>
      serializer.encode(
        flashSaleEvent({
          payload: {
            ...flashSaleEvent().payload,
            items: [],
          },
        }),
      ),
    ).toThrow('must contain at least one item');
  });
});

function flashSaleEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    eventType: 'FLASH_SALE_SCHEDULED',
    schemaVersion: 1,
    occurredAt: new Date('2026-09-20T08:00:00.123Z'),
    payload: {
      flashSaleId: '9007199254740993',
      startsAt: '2026-10-01T08:00:00.000Z',
      endsAt: '2026-10-01T10:00:00.000Z',
      items: [
        {
          flashSaleItemId: '9007199254740995',
          productSkuId: '9007199254740997',
          originalPrice: '100.00',
          salePrice: '75.00',
          quantity: 25,
        },
      ],
    },
    ...overrides,
  };
}

function timestampDate(value: { seconds?: string; nanos?: number } | undefined): Date {
  return new Date(
    Number(BigInt(value?.seconds ?? '0') * 1_000n) + Math.floor((value?.nanos ?? 0) / 1_000_000),
  );
}
