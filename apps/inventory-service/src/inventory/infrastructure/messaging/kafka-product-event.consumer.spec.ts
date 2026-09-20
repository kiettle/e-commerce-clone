import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EachMessagePayload } from 'kafkajs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HandleProductCreatedUseCase } from '../../application/use-cases/handle-product-created.use-case';
import { ConflictingProductEventError } from '../../domain/errors/conflicting-product-event.error';
import { KafkaProductEventConsumer } from './kafka-product-event.consumer';
import { ProtobufProductEventDeserializer } from './protobuf-product-event-deserializer';

const eventId = '550e8400-e29b-41d4-a716-446655440000';

describe('KafkaProductEventConsumer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs conflicting event reuse at error severity without logging the payload', async () => {
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const deserializer = {
      decode: vi.fn().mockReturnValue({
        eventId,
        eventType: 'PRODUCT_CREATED',
        schemaVersion: 1,
        productCreated: {
          eventId,
          schemaVersion: 1,
          productId: 100n,
          name: 'Sensitive product name',
          skus: [],
        },
      }),
    } as unknown as ProtobufProductEventDeserializer;
    const handleProductCreated = {
      execute: vi.fn().mockRejectedValue(new ConflictingProductEventError(eventId)),
    } as unknown as HandleProductCreatedUseCase;
    const consumer = new KafkaProductEventConsumer(
      { get: vi.fn() } as unknown as ConfigService,
      deserializer,
      handleProductCreated,
    );

    await expect(handleMessage(consumer)).rejects.toBeInstanceOf(ConflictingProductEventError);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining(eventId));
    expect(logger).not.toHaveBeenCalledWith(expect.stringContaining('Sensitive product name'));
  });
});

function handleMessage(consumer: KafkaProductEventConsumer): Promise<void> {
  const payload = {
    topic: 'product-events',
    partition: 0,
    message: { value: Buffer.from('stored event') },
  } as EachMessagePayload;

  return (
    consumer as unknown as {
      handleMessage(message: EachMessagePayload): Promise<void>;
    }
  ).handleMessage(payload);
}
