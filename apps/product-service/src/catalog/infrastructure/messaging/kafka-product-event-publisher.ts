import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Partitioners, Producer } from 'kafkajs';
import {
  ProductEvent,
  ProductEventTransportPort,
} from '../../application/ports/product-event-transport.port';
import { ProtobufProductEventSerializer } from './protobuf-product-event-serializer';

@Injectable()
export class KafkaProductEventPublisher implements ProductEventTransportPort, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProductEventPublisher.name);
  private readonly producer: Producer;
  private readonly topic: string;
  private connectPromise?: Promise<void>;
  private connected = false;

  constructor(
    configService: ConfigService,
    private readonly serializer: ProtobufProductEventSerializer,
  ) {
    const brokers = (configService.get<string>('KAFKA_BROKERS') ?? 'localhost:9094')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);

    const kafka = new Kafka({
      clientId: 'product-service',
      brokers,
    });

    this.producer = kafka.producer({
      createPartitioner: Partitioners.LegacyPartitioner,
    });
    this.topic = configService.get<string>('PRODUCT_EVENTS_TOPIC') ?? 'product-events';
  }

  async publish(event: ProductEvent): Promise<void> {
    const value = this.serializer.encode(event);

    await this.ensureConnected();

    try {
      await this.producer.send({
        topic: this.topic,
        messages: [
          {
            key: event.partitionKey,
            value,
          },
        ],
      });
    } catch (error) {
      this.logger.error('Failed to publish ProductCreated event.', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.connectPromise ??= this.producer.connect().then(() => {
      this.connected = true;
    });

    await this.connectPromise;
  }
}
