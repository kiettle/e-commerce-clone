import { join } from 'node:path';
import * as protobuf from 'protobufjs';
import { ProductCreatedEvent } from '../../application/ports/product-event-publisher.port';

interface DecodedProductCreatedEvent {
  eventId: string;
  eventType: string;
  productId: string;
  name: string;
  skus: Array<{
    productSkuId: string;
    skuCode: string;
    status: string;
    quantity: string;
  }>;
}

export class ProtobufProductEventSerializer {
  private readonly productEventType: protobuf.Type;

  constructor() {
    const root = protobuf.loadSync(
      join(process.cwd(), 'libs/proto/product_event.proto'),
    );
    this.productEventType = root.lookupType('product.events.ProductEvent');
  }

  encodeProductCreated(event: ProductCreatedEvent): Buffer {
    const now = new Date();
    const eventPayload = {
      eventId: crypto.randomUUID(),
      eventType: 0,
      occurredAt: {
        seconds: Math.floor(now.getTime() / 1000),
        nanos: (now.getTime() % 1000) * 1_000_000,
      },
      productCreated: {
        productId: Number(event.productId),
        name: event.name,
        skus: event.skus.map((sku) => ({
          productSkuId: Number(sku.productSkuId),
          skuCode: sku.skuCode,
          status: sku.status,
          quantity: sku.quantity,
        })),
      },
    };

    const verificationError = this.productEventType.verify(eventPayload);

    if (verificationError) {
      throw new Error(`Invalid ProductCreated event: ${verificationError}`);
    }

    return Buffer.from(
      this.productEventType.encode(this.productEventType.create(eventPayload)).finish(),
    );
  }

  decodeProductCreated(buffer: Buffer): DecodedProductCreatedEvent {
    const decoded = this.productEventType.toObject(
      this.productEventType.decode(buffer),
      {
        longs: String,
        enums: String,
      },
    ) as {
      eventId: string;
      eventType: string;
      productCreated?: {
        productId: string;
        name: string;
        skus: Array<{
          productSkuId: string;
          skuCode: string;
          status: string;
          quantity: string;
        }>;
      };
    };

    if (!decoded.productCreated) {
      throw new Error('Decoded event is not ProductCreated.');
    }

    return {
      eventId: decoded.eventId,
      eventType: decoded.eventType,
      productId: decoded.productCreated.productId,
      name: decoded.productCreated.name,
      skus: decoded.productCreated.skus,
    };
  }
}
