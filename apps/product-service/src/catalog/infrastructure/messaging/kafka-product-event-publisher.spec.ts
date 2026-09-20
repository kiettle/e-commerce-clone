import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductSkuStatus } from '../../domain/enums/product-sku-status.enum';
import { KafkaProductEventPublisher } from './kafka-product-event-publisher';
import { ProtobufProductEventSerializer } from './protobuf-product-event-serializer';

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
    const publisher = new KafkaProductEventPublisher(config, new ProtobufProductEventSerializer());

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
    const publisher = new KafkaProductEventPublisher(config, new ProtobufProductEventSerializer());
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
});
