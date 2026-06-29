import { join } from 'node:path';
import * as protobuf from 'protobufjs';
import { ProductCreatedStockEvent } from '../../domain/repositories/inventory.repository.port';

export interface DecodedProductEvent {
  eventId: string;
  eventType: string;
  productCreated?: ProductCreatedStockEvent;
}

interface ProductEventObject {
  eventId?: string;
  eventType?: string;
  productCreated?: {
    productId?: string;
    name?: string;
    skus?: Array<{
      productSkuId?: string;
      skuCode?: string;
      status?: string;
      quantity?: string | number;
    }>;
  };
}

export class ProtobufProductEventDeserializer {
  private readonly productEventType: protobuf.Type;

  constructor() {
    const root = protobuf.loadSync(
      join(process.cwd(), 'libs/proto/product_event.proto'),
    );
    this.productEventType = root.lookupType('product.events.ProductEvent');
  }

  decode(buffer: Buffer): DecodedProductEvent {
    const decoded = this.productEventType.toObject(
      this.productEventType.decode(buffer),
      {
        longs: String,
        enums: String,
      },
    ) as ProductEventObject;

    const eventId = decoded.eventId ?? '';
    const eventType = decoded.eventType ?? '';

    if (eventType !== 'PRODUCT_CREATED' || !decoded.productCreated) {
      return { eventId, eventType };
    }

    return {
      eventId,
      eventType,
      productCreated: {
        eventId,
        productId: BigInt(decoded.productCreated.productId ?? 0),
        name: decoded.productCreated.name ?? '',
        skus: (decoded.productCreated.skus ?? []).map((sku) => ({
          productSkuId: BigInt(sku.productSkuId ?? 0),
          skuCode: sku.skuCode ?? '',
          status: sku.status ?? '',
          quantity: Number(sku.quantity ?? 0),
        })),
      },
    };
  }
}
