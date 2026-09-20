import { join } from 'node:path';
import * as protobuf from 'protobufjs';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';

const PRODUCT_CREATED = 'PRODUCT_CREATED';
const PRODUCT_CREATED_SCHEMA_VERSION = 1;
const MAX_INT64 = 9_223_372_036_854_775_807n;

export interface StoredProductEventEnvelope {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export interface DecodedProductCreatedEvent {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  occurredAt: Date;
  productId: string;
  name: string;
  skus: Array<{
    productSkuId: string;
    skuCode: string;
    status: string;
    quantity: string;
  }>;
}

interface ProductCreatedPayload {
  productId: string;
  name: string;
  skus: Array<{
    productSkuId: string;
    skuCode: string;
    status: ProductSkuStatus;
    quantity: string;
  }>;
}

interface DecodedProductEventObject {
  eventId?: string;
  eventType?: string;
  schemaVersion?: number;
  occurredAt?: {
    seconds?: string;
    nanos?: number;
  };
  productCreated?: {
    productId?: string;
    name?: string;
    skus?: Array<{
      productSkuId?: string;
      skuCode?: string;
      status?: string;
      quantity?: string;
    }>;
  };
}

export class ProtobufProductEventSerializer {
  private readonly productEventType: protobuf.Type;

  constructor() {
    const root = protobuf.loadSync(join(process.cwd(), 'libs/proto/product_event.proto'));
    this.productEventType = root.lookupType('product.events.ProductEvent');
  }

  encode(event: StoredProductEventEnvelope): Buffer {
    this.validateEnvelope(event);
    const payload = parseProductCreatedPayload(event.payload);
    const occurredAtMilliseconds = event.occurredAt.getTime();
    const eventPayload = {
      eventId: event.eventId,
      eventType: 0,
      schemaVersion: event.schemaVersion,
      occurredAt: {
        seconds: Math.floor(occurredAtMilliseconds / 1_000).toString(),
        nanos: (occurredAtMilliseconds % 1_000) * 1_000_000,
      },
      productCreated: payload,
    };

    const message = this.productEventType.fromObject(eventPayload);
    const verificationError = this.productEventType.verify(message);

    if (verificationError) {
      throw new Error(`Invalid ProductCreated event: ${verificationError}`);
    }

    return Buffer.from(this.productEventType.encode(message).finish());
  }

  decodeProductCreated(buffer: Buffer): DecodedProductCreatedEvent {
    const decoded = this.productEventType.toObject(this.productEventType.decode(buffer), {
      longs: String,
      enums: String,
    }) as DecodedProductEventObject;

    if (!decoded.productCreated) {
      throw new Error('Decoded event is not ProductCreated.');
    }

    const seconds = BigInt(decoded.occurredAt?.seconds ?? '0');
    const nanos = decoded.occurredAt?.nanos ?? 0;

    return {
      eventId: decoded.eventId ?? '',
      eventType: decoded.eventType ?? '',
      schemaVersion: decoded.schemaVersion ?? 0,
      occurredAt: new Date(Number(seconds * 1_000n) + Math.floor(nanos / 1_000_000)),
      productId: decoded.productCreated.productId ?? '0',
      name: decoded.productCreated.name ?? '',
      skus: (decoded.productCreated.skus ?? []).map((sku) => ({
        productSkuId: sku.productSkuId ?? '0',
        skuCode: sku.skuCode ?? '',
        status: sku.status ?? '',
        quantity: sku.quantity ?? '0',
      })),
    };
  }

  private validateEnvelope(event: StoredProductEventEnvelope): void {
    if (!event.eventId.trim()) {
      throw new Error('Product event ID must not be empty.');
    }

    if (event.eventType !== PRODUCT_CREATED) {
      throw new Error(`Unsupported product event type: ${event.eventType}.`);
    }

    if (event.schemaVersion !== PRODUCT_CREATED_SCHEMA_VERSION) {
      throw new Error(`Unsupported PRODUCT_CREATED schema version: ${event.schemaVersion}.`);
    }

    if (!(event.occurredAt instanceof Date) || Number.isNaN(event.occurredAt.getTime())) {
      throw new Error('Product event occurrence time is invalid.');
    }
  }
}

function parseProductCreatedPayload(payload: unknown): ProductCreatedPayload {
  if (!isRecord(payload)) {
    throw new Error('ProductCreated payload must be an object.');
  }

  const productId = parsePositiveInt64(payload.productId, 'productId');

  if (typeof payload.name !== 'string' || !payload.name.trim()) {
    throw new Error('ProductCreated payload name must not be empty.');
  }

  if (!Array.isArray(payload.skus) || payload.skus.length === 0) {
    throw new Error('ProductCreated payload must contain at least one SKU.');
  }

  return {
    productId,
    name: payload.name,
    skus: payload.skus.map((sku, index) => parseSku(sku, index)),
  };
}

function parseSku(value: unknown, index: number): ProductCreatedPayload['skus'][number] {
  if (!isRecord(value)) {
    throw new Error(`ProductCreated SKU at index ${index} must be an object.`);
  }

  if (typeof value.skuCode !== 'string' || !value.skuCode.trim()) {
    throw new Error(`ProductCreated SKU at index ${index} has an invalid skuCode.`);
  }

  if (!Object.values(ProductSkuStatus).includes(value.status as ProductSkuStatus)) {
    throw new Error(`ProductCreated SKU at index ${index} has an invalid status.`);
  }

  return {
    productSkuId: parsePositiveInt64(value.productSkuId, `skus[${index}].productSkuId`),
    skuCode: value.skuCode,
    status: value.status as ProductSkuStatus,
    quantity: parseNonNegativeInt64(value.quantity, `skus[${index}].quantity`),
  };
}

function parsePositiveInt64(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a decimal int64 value stored as a string.`);
  }

  const parsed = parseInt64(value, field);

  if (BigInt(parsed) <= 0n) {
    throw new Error(`${field} must be greater than zero.`);
  }

  return parsed;
}

function parseNonNegativeInt64(value: unknown, field: string): string {
  const parsed = parseInt64(value, field);

  if (BigInt(parsed) < 0n) {
    throw new Error(`${field} must not be negative.`);
  }

  return parsed;
}

function parseInt64(value: unknown, field: string): string {
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isSafeInteger(value))) {
    throw new Error(`${field} must be a decimal int64 value.`);
  }

  const decimal = String(value);
  if (!/^-?\d+$/.test(decimal)) {
    throw new Error(`${field} must be a decimal int64 value.`);
  }

  const parsed = BigInt(decimal);
  if (parsed < -MAX_INT64 - 1n || parsed > MAX_INT64) {
    throw new Error(`${field} is outside the int64 range.`);
  }

  return decimal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
