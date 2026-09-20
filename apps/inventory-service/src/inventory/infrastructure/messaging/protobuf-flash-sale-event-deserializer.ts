import { join } from 'node:path';
import * as protobuf from 'protobufjs';
import { HandleFlashSaleScheduledCommand } from '../../application/dto/handle-flash-sale-scheduled.command';

export interface DecodedFlashSaleEvent {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  flashSaleScheduled?: HandleFlashSaleScheduledCommand;
}

interface FlashSaleEventObject {
  eventId?: string;
  eventType?: string;
  schemaVersion?: number;
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

export class ProtobufFlashSaleEventDeserializer {
  private readonly eventType: protobuf.Type;

  constructor() {
    const root = protobuf.loadSync(join(process.cwd(), 'libs/proto/flash_sale_event.proto'));
    this.eventType = root.lookupType('flashsale.events.FlashSaleEvent');
  }

  decode(buffer: Buffer): DecodedFlashSaleEvent {
    const decoded = this.eventType.toObject(this.eventType.decode(buffer), {
      longs: String,
      enums: String,
    }) as FlashSaleEventObject;
    const eventId = decoded.eventId ?? '';
    const eventType = decoded.eventType ?? '';
    const schemaVersion = decoded.schemaVersion ?? 0;

    if (eventType !== 'FLASH_SALE_SCHEDULED' || !decoded.flashSaleScheduled) {
      return { eventId, eventType, schemaVersion };
    }

    return {
      eventId,
      eventType,
      schemaVersion,
      flashSaleScheduled: {
        eventId,
        schemaVersion,
        flashSaleId: BigInt(decoded.flashSaleScheduled.flashSaleId ?? '0'),
        startsAt: fromTimestamp(decoded.flashSaleScheduled.startsAt),
        endsAt: fromTimestamp(decoded.flashSaleScheduled.endsAt),
        items: (decoded.flashSaleScheduled.items ?? []).map((item) => ({
          flashSaleItemId: BigInt(item.flashSaleItemId ?? '0'),
          productSkuId: BigInt(item.productSkuId ?? '0'),
          originalPrice: item.originalPrice ?? '',
          salePrice: item.salePrice ?? '',
          quantityLimit: item.quantityLimit ?? 0,
        })),
      },
    };
  }
}

function fromTimestamp(value: TimestampObject | undefined): Date {
  const seconds = BigInt(value?.seconds ?? '0');
  const nanos = value?.nanos ?? 0;
  return new Date(Number(seconds * 1_000n) + Math.floor(nanos / 1_000_000));
}
