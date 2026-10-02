import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, EachMessagePayload, Kafka } from 'kafkajs';
import { HandleProductCreatedUseCase } from '../../application/use-cases/handle-product-created.use-case';
import { ConflictingProductEventError } from '../../domain/errors/conflicting-product-event.error';
import { ProtobufProductEventDeserializer } from './protobuf-product-event-deserializer';

@Injectable()
export class KafkaProductEventConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProductEventConsumer.name);
  private readonly consumer: Consumer;
  private readonly topic: string;
  private started = false;

  constructor(
    configService: ConfigService,
    private readonly deserializer: ProtobufProductEventDeserializer,
    private readonly handleProductCreated: HandleProductCreatedUseCase,
  ) {
    const brokers = (configService.get<string>('KAFKA_BROKERS') ?? 'localhost:9094')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    const kafka = new Kafka({
      clientId: 'inventory-service',
      brokers,
    });

    this.consumer = kafka.consumer({
      groupId: configService.get<string>('INVENTORY_KAFKA_GROUP_ID') ?? 'inventory-service',
    });
    this.topic = configService.get<string>('PRODUCT_EVENTS_TOPIC') ?? 'product-events';
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: this.topic,
      fromBeginning: false,
    });
    await this.consumer.run({
      eachMessage: (payload) => this.handleMessage(payload),
    });
    this.started = true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.started) {
      await this.consumer.disconnect();
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    if (!payload.message.value) {
      this.logger.warn('Received empty product event message.');
      return;
    }

    const event = this.deserializer.decode(Buffer.from(payload.message.value));

    if (event.eventType !== 'PRODUCT_CREATED' || !event.productCreated) {
      this.logger.debug(`Ignoring product event type ${event.eventType}.`);
      return;
    }

    try {
      await this.handleProductCreated.execute(event.productCreated);
    } catch (error) {
      if (error instanceof ConflictingProductEventError) {
        this.logger.error(
          `Conflicting product event ${event.productCreated.eventId}: ${error.message}`,
        );
      }

      throw error;
    }
  }
}
