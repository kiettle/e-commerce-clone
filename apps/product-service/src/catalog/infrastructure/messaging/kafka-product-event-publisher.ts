import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Partitioners, Producer } from 'kafkajs';
import {
  ProductEvent,
  ProductEventTransportPort,
} from '../../application/ports/product-event-transport.port';
import { ProtobufProductEventSerializer } from './protobuf-product-event-serializer';
import { ProtobufFlashSaleEventSerializer } from './protobuf-flash-sale-event-serializer';
import { InvalidProductEventError } from '../../application/errors/invalid-product-event.error';

@Injectable()
export class KafkaProductEventPublisher
  implements ProductEventTransportPort, OnApplicationShutdown
{
  private readonly producer: Producer;
  private readonly productTopic: string;
  private readonly flashSaleTopic: string;
  private connectPromise?: Promise<void>;
  private connected = false;

  constructor(
    configService: ConfigService,
    private readonly productSerializer: ProtobufProductEventSerializer,
    private readonly flashSaleSerializer: ProtobufFlashSaleEventSerializer,
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
    this.productTopic = configService.get<string>('PRODUCT_EVENTS_TOPIC') ?? 'product-events';
    this.flashSaleTopic =
      configService.get<string>('FLASH_SALE_EVENTS_TOPIC') ?? 'flash-sale-events';
  }

  async publish(event: ProductEvent): Promise<void> {
    const { topic, value } = this.serialize(event);

    await this.ensureConnected();

    await this.producer.send({
      topic,
      messages: [
        {
          key: event.partitionKey,
          value,
        },
      ],
    });
  }

  private serialize(event: ProductEvent): { topic: string; value: Buffer } {
    if (event.eventType === 'PRODUCT_CREATED') {
      return { topic: this.productTopic, value: this.productSerializer.encode(event) };
    }
    if (event.eventType === 'FLASH_SALE_SCHEDULED') {
      return { topic: this.flashSaleTopic, value: this.flashSaleSerializer.encode(event) };
    }
    throw new InvalidProductEventError(`Unsupported outbox event type: ${event.eventType}.`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.producer.disconnect();
    this.connected = false;
    this.connectPromise = undefined;
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.connectPromise ??= this.producer
      .connect()
      .then(() => {
        this.connected = true;
      })
      .catch((error: unknown) => {
        this.connectPromise = undefined;
        throw error;
      });

    await this.connectPromise;
  }
}
