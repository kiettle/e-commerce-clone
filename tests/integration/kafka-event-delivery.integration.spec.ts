import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Admin, Consumer, Kafka, KafkaMessage, Partitioners } from 'kafkajs';
import * as protobuf from 'protobufjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductOutboxPublisherWorker } from '../../apps/product-service/src/catalog/infrastructure/messaging/product-outbox-publisher.worker';
import { KafkaProductEventPublisher } from '../../apps/product-service/src/catalog/infrastructure/messaging/kafka-product-event-publisher';
import { ProtobufFlashSaleEventSerializer } from '../../apps/product-service/src/catalog/infrastructure/messaging/protobuf-flash-sale-event-serializer';
import { ProtobufProductEventSerializer } from '../../apps/product-service/src/catalog/infrastructure/messaging/protobuf-product-event-serializer';
import { PrismaProductOutboxRepository } from '../../apps/product-service/src/catalog/infrastructure/persistence/prisma/product-outbox.prisma.repository';
import { PrismaService as ProductPrismaService } from '../../apps/product-service/src/catalog/infrastructure/persistence/prisma/prisma.service';
import { HandleFlashSaleScheduledUseCase } from '../../apps/inventory-service/src/inventory/application/use-cases/handle-flash-sale-scheduled.use-case';
import { HandleProductCreatedUseCase } from '../../apps/inventory-service/src/inventory/application/use-cases/handle-product-created.use-case';
import { KafkaFlashSaleEventConsumer } from '../../apps/inventory-service/src/inventory/infrastructure/messaging/kafka-flash-sale-event.consumer';
import { KafkaProductEventConsumer } from '../../apps/inventory-service/src/inventory/infrastructure/messaging/kafka-product-event.consumer';
import { ProtobufFlashSaleEventDeserializer } from '../../apps/inventory-service/src/inventory/infrastructure/messaging/protobuf-flash-sale-event-deserializer';
import { ProtobufProductEventDeserializer } from '../../apps/inventory-service/src/inventory/infrastructure/messaging/protobuf-product-event-deserializer';
import { PrismaFlashSaleStockRepository } from '../../apps/inventory-service/src/inventory/infrastructure/persistence/prisma/flash-sale-stock.prisma.repository';
import { PrismaInventoryRepository } from '../../apps/inventory-service/src/inventory/infrastructure/persistence/prisma/inventory.prisma.repository';
import { PrismaService as InventoryPrismaService } from '../../apps/inventory-service/src/inventory/infrastructure/persistence/prisma/prisma.service';
import { Prisma } from '../../prisma/generated/product/client';
import {
  cleanIntegrationDatabases,
  createIntegrationPrismaClients,
  disconnectIntegrationPrismaClients,
  IntegrationPrismaClients,
} from './support/prisma-clients';

const brokers = process.env.KAFKA_INTEGRATION_BROKERS?.split(',').filter(Boolean);
const describeWithKafka = brokers?.length ? describe : describe.skip;
const occurredAt = new Date('2026-09-21T08:00:00.123Z');

describeWithKafka('Kafka event delivery and duplicate consumption', () => {
  let clients: IntegrationPrismaClients;
  let outboxRepository: PrismaProductOutboxRepository;
  let inventoryRepository: PrismaInventoryRepository;
  let flashSaleStockRepository: PrismaFlashSaleStockRepository;

  beforeAll(async () => {
    clients = await createIntegrationPrismaClients();
    outboxRepository = new PrismaProductOutboxRepository(
      clients.product as unknown as ProductPrismaService,
    );
    inventoryRepository = new PrismaInventoryRepository(
      clients.inventory as unknown as InventoryPrismaService,
    );
    flashSaleStockRepository = new PrismaFlashSaleStockRepository(
      clients.inventory as unknown as InventoryPrismaService,
    );
  });

  beforeEach(async () => {
    await cleanIntegrationDatabases(clients);
  });

  afterAll(async () => {
    if (clients) {
      await cleanIntegrationDatabases(clients);
      await disconnectIntegrationPrismaClients(clients);
    }
  });

  it('publishes a stable product envelope and consumes an identical duplicate successfully', async () => {
    const kafka = await createKafkaTestContext('product-delivery');
    const config = kafka.config();
    const serializer = new ProtobufProductEventSerializer();
    const publisher = new KafkaProductEventPublisher(
      config,
      serializer,
      new ProtobufFlashSaleEventSerializer(),
    );
    const consumer = new KafkaProductEventConsumer(
      config,
      new ProtobufProductEventDeserializer(),
      new HandleProductCreatedUseCase(inventoryRepository),
    );
    const worker = new ProductOutboxPublisherWorker(outboxRepository, publisher, config);
    const event = productEvent();

    try {
      await consumer.onApplicationBootstrap();
      await insertOutboxEvent(event);
      worker.onApplicationBootstrap();

      await waitFor(async () => {
        const stored = await clients.product.productOutboxEvent.findUnique({
          where: { id: event.eventId },
        });
        return stored?.status === 'PUBLISHED' && stored.attemptCount === 1;
      }, 'the first product publication');
      await waitFor(
        () => clients.inventory.processedProductEvent.count().then((count) => count === 1),
        'the product inventory projection',
      );

      await clients.product.productOutboxEvent.update({
        where: { id: event.eventId },
        data: {
          status: 'PROCESSING',
          leaseOwner: 'crashed-worker',
          leaseUntil: oneMinuteAgo(),
          publishedAt: null,
        },
      });

      await waitFor(async () => {
        const stored = await clients.product.productOutboxEvent.findUnique({
          where: { id: event.eventId },
        });
        return stored?.status === 'PUBLISHED' && stored.attemptCount === 2;
      }, 'the duplicate product publication');
      await waitForGroupToCatchUp(kafka.admin, kafka.productGroup, kafka.productTopic);

      const messages = await readMessages(kafka.client, kafka.productTopic, 2);
      const decoded = messages.map((message) => serializer.decodeProductCreated(message.value!));

      expect(messages.map((message) => message.key?.toString())).toEqual([
        event.partitionKey,
        event.partitionKey,
      ]);
      expect(decoded.map((message) => message.eventId)).toEqual([event.eventId, event.eventId]);
      expect(decoded.map((message) => message.occurredAt)).toEqual([
        event.occurredAt,
        event.occurredAt,
      ]);
      expect(decoded.map((message) => message.schemaVersion)).toEqual([1, 1]);
      await expect(clients.inventory.inventoryStock.count()).resolves.toBe(2);
      await expect(
        clients.inventory.stockTransaction.count({ where: { type: 'INITIALIZE' } }),
      ).resolves.toBe(2);
      await expect(clients.inventory.processedProductEvent.count()).resolves.toBe(1);
    } finally {
      await worker.onModuleDestroy();
      await consumer.onModuleDestroy();
      await consumer.onApplicationShutdown();
      await publisher.onApplicationShutdown();
      await kafka.close();
    }
  });

  it('rejects a reused product event ID with another payload and logs the conflict', async () => {
    const kafka = await createKafkaTestContext('product-conflict');
    const config = kafka.config();
    const publisher = new KafkaProductEventPublisher(
      config,
      new ProtobufProductEventSerializer(),
      new ProtobufFlashSaleEventSerializer(),
    );
    const consumer = new KafkaProductEventConsumer(
      config,
      new ProtobufProductEventDeserializer(),
      new HandleProductCreatedUseCase(inventoryRepository),
    );
    const errorLog = vi.spyOn(Logger.prototype, 'error');
    const event = productEvent();

    try {
      await consumer.onApplicationBootstrap();
      await publisher.publish(event);
      await waitForGroupToCatchUp(kafka.admin, kafka.productGroup, kafka.productTopic);
      const before = await clients.inventory.inventoryStock.findMany({ orderBy: { id: 'asc' } });

      await publisher.publish({
        ...event,
        payload: { ...event.payload, name: 'Conflicting product name' },
      });
      await waitFor(
        () =>
          Promise.resolve(
            errorLog.mock.calls.some(([message]) =>
              String(message).includes(`Conflicting product event ${event.eventId}`),
            ),
          ),
        'the high-severity conflicting-product log',
      );

      expect(await clients.inventory.inventoryStock.findMany({ orderBy: { id: 'asc' } })).toEqual(
        before,
      );
      await expect(clients.inventory.processedProductEvent.count()).resolves.toBe(1);
      await expect(
        clients.inventory.stockTransaction.count({ where: { type: 'INITIALIZE' } }),
      ).resolves.toBe(2);
    } finally {
      errorLog.mockRestore();
      await consumer.onModuleDestroy();
      await consumer.onApplicationShutdown();
      await publisher.onApplicationShutdown();
      await kafka.close();
    }
  });

  it('initializes every flash-sale stock once when the outbox event is delivered twice', async () => {
    const kafka = await createKafkaTestContext('flash-sale-duplicate');
    const config = kafka.config();
    const publisher = new KafkaProductEventPublisher(
      config,
      new ProtobufProductEventSerializer(),
      new ProtobufFlashSaleEventSerializer(),
    );
    const consumer = new KafkaFlashSaleEventConsumer(
      config,
      new ProtobufFlashSaleEventDeserializer(),
      new HandleFlashSaleScheduledUseCase(flashSaleStockRepository),
    );
    const worker = new ProductOutboxPublisherWorker(outboxRepository, publisher, config);
    const event = flashSaleEvent();

    try {
      await consumer.onApplicationBootstrap();
      await insertOutboxEvent(event);
      worker.onApplicationBootstrap();

      await waitFor(async () => {
        const stored = await clients.product.productOutboxEvent.findUnique({
          where: { id: event.eventId },
        });
        return stored?.status === 'PUBLISHED' && stored.attemptCount === 1;
      }, 'the first flash-sale publication');
      await waitFor(
        () => clients.inventory.processedFlashSaleEvent.count().then((count) => count === 1),
        'the flash-sale inventory projection',
      );

      await clients.product.productOutboxEvent.update({
        where: { id: event.eventId },
        data: {
          status: 'PROCESSING',
          leaseOwner: 'crashed-worker',
          leaseUntil: oneMinuteAgo(),
          publishedAt: null,
        },
      });
      await waitFor(async () => {
        const stored = await clients.product.productOutboxEvent.findUnique({
          where: { id: event.eventId },
        });
        return stored?.status === 'PUBLISHED' && stored.attemptCount === 2;
      }, 'the duplicate flash-sale publication');
      await waitForGroupToCatchUp(kafka.admin, kafka.flashGroup, kafka.flashTopic);

      const rows = await clients.inventory.flashSaleStock.findMany({ orderBy: { id: 'asc' } });
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.stockLimit)).toEqual([5, 3]);
      expect(rows.map((row) => row.reservedQuantity)).toEqual([0, 0]);
      expect(rows.map((row) => row.soldQuantity)).toEqual([0, 0]);
      await expect(clients.inventory.processedFlashSaleEvent.count()).resolves.toBe(1);
    } finally {
      await worker.onModuleDestroy();
      await consumer.onModuleDestroy();
      await consumer.onApplicationShutdown();
      await publisher.onApplicationShutdown();
      await kafka.close();
    }
  });

  it.each([
    ['a partially invalid flash-sale event', 1, 0, 'positive integers'],
    ['an unsupported flash-sale schema', 2, 5, 'Unsupported flash sale event schema version'],
  ])(
    'rejects %s without creating a partial projection',
    async (_name, schemaVersion, stockLimit, message) => {
      const kafka = await createKafkaTestContext(`invalid-flash-${schemaVersion}`);
      const config = kafka.config();
      const rejection = deferred<Error>();
      const useCase = new HandleFlashSaleScheduledUseCase(flashSaleStockRepository);
      const reportingUseCase = {
        execute: async (...args: Parameters<HandleFlashSaleScheduledUseCase['execute']>) => {
          try {
            await useCase.execute(...args);
          } catch (error) {
            rejection.resolve(error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        },
      } as unknown as HandleFlashSaleScheduledUseCase;
      const consumer = new KafkaFlashSaleEventConsumer(
        config,
        new ProtobufFlashSaleEventDeserializer(),
        reportingUseCase,
      );
      const producer = kafka.client.producer({
        createPartitioner: Partitioners.LegacyPartitioner,
      });

      try {
        await consumer.onApplicationBootstrap();
        await producer.connect();
        await producer.send({
          topic: kafka.flashTopic,
          messages: [
            {
              key: '9001',
              value: encodeRawFlashSaleEvent({ schemaVersion, secondStockLimit: stockLimit }),
            },
          ],
        });

        const error = await withTimeout(rejection.promise, 'the invalid flash-sale rejection');
        expect(error.message).toContain(message);
        await expect(clients.inventory.flashSaleStock.count()).resolves.toBe(0);
        await expect(clients.inventory.processedFlashSaleEvent.count()).resolves.toBe(0);
      } finally {
        await producer.disconnect();
        await consumer.onModuleDestroy();
        await consumer.onApplicationShutdown();
        await kafka.close();
      }
    },
  );

  async function insertOutboxEvent(event: StoredEvent): Promise<void> {
    const aggregateId = BigInt(String(event.payload.productId ?? event.payload.flashSaleId));
    await clients.product.productOutboxEvent.create({
      data: {
        id: event.eventId,
        aggregateType: event.eventType === 'PRODUCT_CREATED' ? 'PRODUCT' : 'FLASH_SALE',
        aggregateId,
        aggregateVersion: 1,
        eventType: event.eventType,
        schemaVersion: event.schemaVersion,
        partitionKey: event.partitionKey,
        occurredAt: event.occurredAt,
        payload: event.payload,
        nextAttemptAt: oneMinuteAgo(),
      },
    });
  }
});

interface StoredEvent {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  partitionKey: string;
  occurredAt: Date;
  payload: Prisma.InputJsonObject;
}

interface KafkaTestContext {
  client: Kafka;
  admin: Admin;
  productTopic: string;
  flashTopic: string;
  productGroup: string;
  flashGroup: string;
  config(): ConfigService;
  close(): Promise<void>;
}

async function createKafkaTestContext(label: string): Promise<KafkaTestContext> {
  if (!brokers?.length) {
    throw new Error('KAFKA_INTEGRATION_BROKERS is required.');
  }
  const suffix = `${label}-${randomUUID()}`;
  const productTopic = `product-events-${suffix}`;
  const flashTopic = `flash-sale-events-${suffix}`;
  const productGroup = `inventory-products-${suffix}`;
  const flashGroup = `inventory-flash-sales-${suffix}`;
  const client = new Kafka({ clientId: `integration-${suffix}`, brokers });
  const admin = client.admin();
  await admin.connect();
  await admin.createTopics({
    waitForLeaders: true,
    topics: [
      { topic: productTopic, numPartitions: 1, replicationFactor: 1 },
      { topic: flashTopic, numPartitions: 1, replicationFactor: 1 },
    ],
  });

  return {
    client,
    admin,
    productTopic,
    flashTopic,
    productGroup,
    flashGroup,
    config: () =>
      ({
        get: (name: string) =>
          ({
            KAFKA_BROKERS: brokers.join(','),
            PRODUCT_EVENTS_TOPIC: productTopic,
            FLASH_SALE_EVENTS_TOPIC: flashTopic,
            INVENTORY_KAFKA_GROUP_ID: productGroup,
            INVENTORY_FLASH_SALE_KAFKA_GROUP_ID: flashGroup,
            PRODUCT_OUTBOX_POLL_INTERVAL_MS: 250,
            PRODUCT_OUTBOX_BATCH_SIZE: 10,
            PRODUCT_OUTBOX_LEASE_MS: 5_000,
            PRODUCT_OUTBOX_SHUTDOWN_TIMEOUT_MS: 2_000,
            PRODUCT_OUTBOX_MAX_ATTEMPTS: 3,
          })[name],
      }) as ConfigService,
    close: async () => {
      await admin.deleteTopics({ topics: [productTopic, flashTopic] }).catch(() => undefined);
      await admin.disconnect();
    },
  };
}

function productEvent(): StoredEvent {
  const productId = 7_001n;
  return {
    eventId: randomUUID(),
    eventType: 'PRODUCT_CREATED',
    schemaVersion: 1,
    partitionKey: productId.toString(),
    occurredAt,
    payload: {
      productId: productId.toString(),
      name: 'Kafka Integration Keyboard',
      skus: [
        {
          productSkuId: '7101',
          skuCode: 'KAFKA-BLACK',
          status: 'AVAILABLE',
          quantity: 12,
        },
        {
          productSkuId: '7102',
          skuCode: 'KAFKA-WHITE',
          status: 'AVAILABLE',
          quantity: 7,
        },
      ],
    },
  };
}

function flashSaleEvent(): StoredEvent {
  return {
    eventId: randomUUID(),
    eventType: 'FLASH_SALE_SCHEDULED',
    schemaVersion: 1,
    partitionKey: '9001',
    occurredAt,
    payload: {
      flashSaleId: '9001',
      startsAt: '2026-09-21T09:00:00.000Z',
      endsAt: '2026-09-21T11:00:00.000Z',
      items: [
        {
          flashSaleItemId: '9101',
          productSkuId: '7101',
          stockLimit: 5,
          maxQuantityPerUser: 1,
        },
        {
          flashSaleItemId: '9102',
          productSkuId: '7102',
          stockLimit: 3,
          maxQuantityPerUser: 1,
        },
      ],
    },
  };
}

async function readMessages(kafka: Kafka, topic: string, count: number): Promise<KafkaMessage[]> {
  const consumer = kafka.consumer({ groupId: `observer-${randomUUID()}` });
  const messages: KafkaMessage[] = [];
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });
  await consumer.run({
    eachMessage: ({ message }) => {
      messages.push(message);
      return Promise.resolve();
    },
  });

  try {
    await waitFor(() => Promise.resolve(messages.length >= count), `${count} Kafka messages`);
    return messages.slice(0, count);
  } finally {
    await stopConsumer(consumer);
  }
}

async function waitForGroupToCatchUp(admin: Admin, groupId: string, topic: string): Promise<void> {
  await waitFor(async () => {
    const [groupTopic] = await admin.fetchOffsets({ groupId, topics: [topic] });
    const topicOffsets = await admin.fetchTopicOffsets(topic);
    if (!groupTopic || groupTopic.partitions.length !== topicOffsets.length) {
      return false;
    }
    return topicOffsets.every((partition) => {
      const groupPartition = groupTopic.partitions.find(
        (candidate) => candidate.partition === partition.partition,
      );
      return groupPartition?.offset === partition.high;
    });
  }, `consumer group ${groupId} to commit every ${topic} message`);
}

async function stopConsumer(consumer: Consumer): Promise<void> {
  await consumer.stop().catch(() => undefined);
  await consumer.disconnect().catch(() => undefined);
}

function encodeRawFlashSaleEvent(options: {
  schemaVersion: number;
  secondStockLimit: number;
}): Buffer {
  const root = protobuf.loadSync(join(process.cwd(), 'libs/proto/flash_sale_event.proto'));
  const eventType = root.lookupType('flashsale.events.FlashSaleEvent');
  const message = eventType.fromObject({
    eventId: randomUUID(),
    eventType: 0,
    schemaVersion: options.schemaVersion,
    occurredAt: timestamp(occurredAt),
    flashSaleScheduled: {
      flashSaleId: '9001',
      startsAt: timestamp(new Date('2026-09-21T09:00:00.000Z')),
      endsAt: timestamp(new Date('2026-09-21T11:00:00.000Z')),
      items: [
        {
          flashSaleItemId: '9101',
          productSkuId: '7101',
          stockLimit: 5,
          maxQuantityPerUser: 1,
        },
        {
          flashSaleItemId: '9102',
          productSkuId: '7102',
          stockLimit: options.secondStockLimit,
          maxQuantityPerUser: 1,
        },
      ],
    },
  });
  return Buffer.from(eventType.encode(message).finish());
}

function timestamp(value: Date): { seconds: string; nanos: number } {
  return {
    seconds: Math.floor(value.getTime() / 1_000).toString(),
    nanos: (value.getTime() % 1_000) * 1_000_000,
  };
}

function oneMinuteAgo(): Date {
  return new Date(Date.now() - 60_000);
}

async function waitFor(
  predicate: () => Promise<boolean>,
  description: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function withTimeout<T>(promise: Promise<T>, description: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${description}.`)),
          15_000,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
