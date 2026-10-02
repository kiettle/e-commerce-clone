import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import { KafkaProductEventPublisher } from './kafka-product-event-publisher';
import { ProtobufProductEventSerializer } from './protobuf-product-event-serializer';
import { ProtobufFlashSaleEventSerializer } from './protobuf-flash-sale-event-serializer';

const kafkaMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  send: vi.fn(),
}));

vi.mock('kafkajs', () => ({
  Kafka: class {
    producer() {
      return kafkaMocks;
    }
  },
  Partitioners: {
    LegacyPartitioner: vi.fn(),
  },
}));

describe('KafkaProductEventPublisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kafkaMocks.connect.mockResolvedValue(undefined);
    kafkaMocks.disconnect.mockResolvedValue(undefined);
    kafkaMocks.send.mockResolvedValue(undefined);
  });

  it('rejects invalid payload before connecting to or calling Kafka', async () => {
    const config = {
      get: vi.fn(),
    } as unknown as ConfigService;
    const publisher = createPublisher(config);

    await expect(
      publisher.publish({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        eventType: 'PRODUCT_CREATED',
        schemaVersion: 1,
        partitionKey: '20',
        occurredAt: new Date('2026-09-20T08:00:00.000Z'),
        payload: {
          productId: '20',
          name: 'Mechanical Keyboard',
          skus: [
            {
              productSkuId: 101,
              skuCode: 'KEYBOARD-BLACK',
              status: ProductSkuStatus.Available,
              quantity: 12,
            },
          ],
        },
      }),
    ).rejects.toThrow('productSkuId must be a decimal int64 value');
    expect(kafkaMocks.connect).not.toHaveBeenCalled();
    expect(kafkaMocks.send).not.toHaveBeenCalled();
  });

  it('can reconnect after Kafka was unavailable and disconnects on shutdown', async () => {
    const config = {
      get: vi.fn(),
    } as unknown as ConfigService;
    const publisher = createPublisher(config);
    const event = {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'PRODUCT_CREATED',
      schemaVersion: 1,
      partitionKey: '20',
      occurredAt: new Date('2026-09-20T08:00:00.000Z'),
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
        ],
      },
    };
    kafkaMocks.connect.mockRejectedValueOnce(new Error('Kafka unavailable'));

    await expect(publisher.publish(event)).rejects.toThrow('Kafka unavailable');
    await expect(publisher.publish(event)).resolves.toBeUndefined();
    await publisher.onApplicationShutdown();

    expect(kafkaMocks.connect).toHaveBeenCalledTimes(2);
    expect(kafkaMocks.send).toHaveBeenCalledTimes(1);
    expect(kafkaMocks.disconnect).toHaveBeenCalledTimes(1);
  });

  it('routes scheduled flash sales to their configured topic', async () => {
    const config = {
      get: vi.fn((name: string) =>
        name === 'FLASH_SALE_EVENTS_TOPIC' ? 'configured-flash-sales' : undefined,
      ),
    } as unknown as ConfigService;
    const publisher = createPublisher(config);

    await publisher.publish({
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      eventType: 'FLASH_SALE_SCHEDULED',
      schemaVersion: 1,
      partitionKey: '50',
      occurredAt: new Date('2026-09-20T08:00:00.000Z'),
      payload: {
        flashSaleId: '50',
        startsAt: '2026-10-01T08:00:00.000Z',
        endsAt: '2026-10-01T10:00:00.000Z',
        items: [
          {
            flashSaleItemId: '501',
            productSkuId: '1001',
            stockLimit: 25,
            maxQuantityPerUser: 1,
          },
        ],
      },
    });

    expect(kafkaMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'configured-flash-sales',
        messages: [expect.objectContaining({ key: '50' })],
      }),
    );
  });
});

function createPublisher(config: ConfigService): KafkaProductEventPublisher {
  return new KafkaProductEventPublisher(
    config,
    new ProtobufProductEventSerializer(),
    new ProtobufFlashSaleEventSerializer(),
  );
}
