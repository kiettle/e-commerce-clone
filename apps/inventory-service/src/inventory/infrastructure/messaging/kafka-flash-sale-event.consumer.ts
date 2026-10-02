import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, EachMessagePayload, Kafka } from 'kafkajs';
import { HandleFlashSaleScheduledUseCase } from '../../application/use-cases/handle-flash-sale-scheduled.use-case';
import { ConflictingFlashSaleEventError } from '../../domain/errors/conflicting-flash-sale-event.error';
import { ProtobufFlashSaleEventDeserializer } from './protobuf-flash-sale-event-deserializer';

@Injectable()
export class KafkaFlashSaleEventConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(KafkaFlashSaleEventConsumer.name);
  private readonly consumer: Consumer;
  private readonly topic: string;
  private started = false;

  constructor(
    config: ConfigService,
    private readonly deserializer: ProtobufFlashSaleEventDeserializer,
    private readonly handleFlashSaleScheduled: HandleFlashSaleScheduledUseCase,
  ) {
    const brokers = (config.get<string>('KAFKA_BROKERS') ?? 'localhost:9094')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);
    const kafka = new Kafka({ clientId: 'inventory-flash-sale-consumer', brokers });
    this.consumer = kafka.consumer({
      groupId:
        config.get<string>('INVENTORY_FLASH_SALE_KAFKA_GROUP_ID') ?? 'inventory-flash-sale-service',
    });
    this.topic = config.get<string>('FLASH_SALE_EVENTS_TOPIC') ?? 'flash-sale-events';
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: true });
    await this.consumer.run({ eachMessage: (payload) => this.handleMessage(payload) });
    this.started = true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.started) {
      await this.consumer.disconnect();
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    if (!payload.message.value) {
      this.logger.warn('Received empty flash sale event message.');
      return;
    }
    const event = this.deserializer.decode(Buffer.from(payload.message.value));
    if (event.eventType !== 'FLASH_SALE_SCHEDULED' || !event.flashSaleScheduled) {
      this.logger.debug(`Ignoring flash sale event type ${event.eventType}.`);
      return;
    }

    try {
      await this.handleFlashSaleScheduled.execute(event.flashSaleScheduled);
    } catch (error) {
      if (error instanceof ConflictingFlashSaleEventError) {
        this.logger.error(`Conflicting flash sale event ${event.eventId}: ${error.message}`);
      }
      throw error;
    }
  }
}
