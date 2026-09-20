import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EachMessagePayload } from 'kafkajs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HandleFlashSaleScheduledUseCase } from '../../application/use-cases/handle-flash-sale-scheduled.use-case';
import { ConflictingFlashSaleEventError } from '../../domain/errors/conflicting-flash-sale-event.error';
import { KafkaFlashSaleEventConsumer } from './kafka-flash-sale-event.consumer';
import { ProtobufFlashSaleEventDeserializer } from './protobuf-flash-sale-event-deserializer';

const eventId = '550e8400-e29b-41d4-a716-446655440000';

describe('KafkaFlashSaleEventConsumer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes a scheduled event to the use case', async () => {
    const command = {
      eventId,
      schemaVersion: 1,
      flashSaleId: 50n,
      startsAt: new Date('2026-10-01T08:00:00.000Z'),
      endsAt: new Date('2026-10-01T10:00:00.000Z'),
      items: [],
    };
    const handle = { execute: vi.fn().mockResolvedValue(undefined) };
    const consumer = createConsumer(
      {
        decode: vi.fn().mockReturnValue({
          eventId,
          eventType: 'FLASH_SALE_SCHEDULED',
          schemaVersion: 1,
          flashSaleScheduled: command,
        }),
      },
      handle,
    );

    await handleMessage(consumer);

    expect(handle.execute).toHaveBeenCalledWith(command);
  });

  it('logs conflicting event reuse without logging the payload', async () => {
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const handle = {
      execute: vi.fn().mockRejectedValue(new ConflictingFlashSaleEventError(eventId)),
    };
    const consumer = createConsumer(
      {
        decode: vi.fn().mockReturnValue({
          eventId,
          eventType: 'FLASH_SALE_SCHEDULED',
          schemaVersion: 1,
          flashSaleScheduled: {
            eventId,
            schemaVersion: 1,
            flashSaleId: 50n,
            startsAt: new Date(),
            endsAt: new Date(),
            items: [{ salePrice: 'sensitive-value' }],
          },
        }),
      },
      handle,
    );

    await expect(handleMessage(consumer)).rejects.toBeInstanceOf(ConflictingFlashSaleEventError);
    expect(logger).toHaveBeenCalledWith(expect.stringContaining(eventId));
    expect(logger).not.toHaveBeenCalledWith(expect.stringContaining('sensitive-value'));
  });
});

function createConsumer(deserializer: object, useCase: object): KafkaFlashSaleEventConsumer {
  return new KafkaFlashSaleEventConsumer(
    { get: vi.fn() } as unknown as ConfigService,
    deserializer as ProtobufFlashSaleEventDeserializer,
    useCase as HandleFlashSaleScheduledUseCase,
  );
}

function handleMessage(consumer: KafkaFlashSaleEventConsumer): Promise<void> {
  return (
    consumer as unknown as {
      handleMessage(payload: EachMessagePayload): Promise<void>;
    }
  ).handleMessage({
    topic: 'flash-sale-events',
    partition: 0,
    message: { value: Buffer.from('event') },
  } as EachMessagePayload);
}
