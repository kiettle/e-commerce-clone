import { join } from 'node:path';
import * as protobuf from 'protobufjs';
import { InvalidProductEventError } from '../../application/errors/invalid-product-event.error';
import { StoredProductEventEnvelope } from './protobuf-product-event-serializer';

const EVENT_TYPE = 'FLASH_SALE_SCHEDULED';
const SCHEMA_VERSION = 1;
const MAX_INT64 = 9_223_372_036_854_775_807n;

interface FlashSalePayload {
  flashSaleId: string;
  startsAt: Date;
  endsAt: Date;
  items: Array<{
    flashSaleItemId: string;
    productSkuId: string;
    originalPrice: string;
    salePrice: string;
    quantityLimit: number;
  }>;
}

interface DecodedFlashSaleEventObject {
  eventId?: string;
  eventType?: string;
  schemaVersion?: number;
  occurredAt?: TimestampObject;
  flashSaleScheduled?: {
    flashSaleId?: string;
    startsAt?: TimestampObject;
    endsAt?: TimestampObject;
    items?: Array<{
      flashSaleItemId?: string;
      productSkuId?: string;
      originalPrice?: string;
      salePrice?: string;
      quantityLimit?: number;
    }>;
  };
}

interface TimestampObject {
  seconds?: string;
  nanos?: number;
}

export class ProtobufFlashSaleEventSerializer {
  private readonly eventType: protobuf.Type;

  constructor() {
    const root = protobuf.loadSync(join(process.cwd(), 'libs/proto/flash_sale_event.proto'));
    this.eventType = root.lookupType('flashsale.events.FlashSaleEvent');
  }

  encode(event: StoredProductEventEnvelope): Buffer {
    try {
      this.validateEnvelope(event);
      const payload = parsePayload(event.payload);
      const message = this.eventType.fromObject({
        eventId: event.eventId,
        eventType: 0,
        schemaVersion: event.schemaVersion,
        occurredAt: toTimestamp(event.occurredAt),
        flashSaleScheduled: {
          flashSaleId: payload.flashSaleId,
          startsAt: toTimestamp(payload.startsAt),
          endsAt: toTimestamp(payload.endsAt),
          items: payload.items,
        },
      });
      const error = this.eventType.verify(message);
      if (error) {
        throw new InvalidProductEventError(`Invalid FlashSaleScheduled event: ${error}`);
      }
      return Buffer.from(this.eventType.encode(message).finish());
    } catch (error) {
      if (error instanceof InvalidProductEventError) {
        throw error;
      }
      throw new InvalidProductEventError(errorMessage(error));
    }
  }

  decode(buffer: Buffer): DecodedFlashSaleEventObject {
    return this.eventType.toObject(this.eventType.decode(buffer), {
      longs: String,
      enums: String,
    }) as DecodedFlashSaleEventObject;
  }

  private validateEnvelope(event: StoredProductEventEnvelope): void {
    if (!event.eventId.trim()) {
      throw new InvalidProductEventError('Flash sale event ID must not be empty.');
    }
    if (event.eventType !== EVENT_TYPE) {
      throw new InvalidProductEventError(`Unsupported flash sale event type: ${event.eventType}.`);
    }
    if (event.schemaVersion !== SCHEMA_VERSION) {
      throw new InvalidProductEventError(
        `Unsupported FLASH_SALE_SCHEDULED schema version: ${event.schemaVersion}.`,
      );
    }
    assertDate(event.occurredAt, 'Flash sale event occurrence time');
  }
}

function parsePayload(value: unknown): FlashSalePayload {
  if (!isRecord(value)) {
    throw new InvalidProductEventError('FlashSaleScheduled payload must be an object.');
  }
  const startsAt = parseDate(value.startsAt, 'startsAt');
  const endsAt = parseDate(value.endsAt, 'endsAt');
  if (endsAt <= startsAt) {
    throw new InvalidProductEventError('FlashSaleScheduled endsAt must be after startsAt.');
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    throw new InvalidProductEventError('FlashSaleScheduled must contain at least one item.');
  }

  const items = value.items.map((item, index) => parseItem(item, index));
  const itemIds = new Set<string>();
  const skuIds = new Set<string>();
  for (const item of items) {
    if (itemIds.has(item.flashSaleItemId)) {
      throw new InvalidProductEventError('FlashSaleScheduled contains duplicate sale-item IDs.');
    }
    if (skuIds.has(item.productSkuId)) {
      throw new InvalidProductEventError('FlashSaleScheduled contains duplicate SKU IDs.');
    }
    if (moneyCents(item.salePrice) >= moneyCents(item.originalPrice)) {
      throw new InvalidProductEventError('Flash sale price must be below the original price.');
    }
    itemIds.add(item.flashSaleItemId);
    skuIds.add(item.productSkuId);
  }

  return {
    flashSaleId: parsePositiveInt64(value.flashSaleId, 'flashSaleId'),
    startsAt,
    endsAt,
    items,
  };
}

function parseItem(value: unknown, index: number): FlashSalePayload['items'][number] {
  if (!isRecord(value)) {
    throw new InvalidProductEventError(`Flash sale item at index ${index} must be an object.`);
  }
  if (!Number.isInteger(value.quantity) || Number(value.quantity) <= 0) {
    throw new InvalidProductEventError(`items[${index}].quantity must be a positive integer.`);
  }
  return {
    flashSaleItemId: parsePositiveInt64(value.flashSaleItemId, `items[${index}].flashSaleItemId`),
    productSkuId: parsePositiveInt64(value.productSkuId, `items[${index}].productSkuId`),
    originalPrice: parseMoney(value.originalPrice, `items[${index}].originalPrice`),
    salePrice: parseMoney(value.salePrice, `items[${index}].salePrice`),
    quantityLimit: Number(value.quantity),
  };
}

function parsePositiveInt64(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new InvalidProductEventError(`${field} must be a decimal int64 string.`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n || parsed > MAX_INT64) {
    throw new InvalidProductEventError(`${field} must be a positive int64 value.`);
  }
  return value;
}

function parseMoney(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d+\.\d{2}$/.test(value) || Number(value) <= 0) {
    throw new InvalidProductEventError(`${field} must be a positive price with two decimals.`);
  }
  return value;
}

function moneyCents(value: string): bigint {
  return BigInt(value.replace('.', ''));
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string') {
    throw new InvalidProductEventError(`${field} must be an ISO timestamp.`);
  }
  const date = new Date(value);
  assertDate(date, field);
  return date;
}

function assertDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidProductEventError(`${field} is invalid.`);
  }
}

function toTimestamp(value: Date): { seconds: string; nanos: number } {
  const milliseconds = value.getTime();
  return {
    seconds: Math.floor(milliseconds / 1_000).toString(),
    nanos: (milliseconds % 1_000) * 1_000_000,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Stored flash sale event is invalid.';
}
