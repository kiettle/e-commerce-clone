#!/usr/bin/env node

const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const { Kafka, logLevel } = require('kafkajs');
const protobuf = require('protobufjs');

const topic = process.argv[2];
const expectedEventId = process.argv[3];
const expectedCount = Number(process.argv[4] ?? 2);
const timeoutMs = Number(process.argv[5] ?? 15_000);

if (!topic || !expectedEventId || !Number.isInteger(expectedCount) || expectedCount <= 0) {
  console.error(
    'Usage: count-kafka-event-deliveries.js <topic> <event-id> [expected-count] [timeout-ms]',
  );
  process.exit(1);
}

async function main() {
  const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9094')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);
  const root = protobuf.loadSync(join(process.cwd(), 'libs/proto/product_event.proto'));
  const productEventType = root.lookupType('product.events.ProductEvent');
  const kafka = new Kafka({
    clientId: 'product-outbox-integration-verifier',
    brokers,
    logLevel: logLevel.NOTHING,
  });
  const consumer = kafka.consumer({
    groupId: `product-outbox-integration-${randomUUID()}`,
  });
  let matchingCount = 0;
  let timeout;

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });

  const expectedDeliveries = new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(
          `Expected ${expectedCount} deliveries for ${expectedEventId}, received ${matchingCount}.`,
        ),
      );
    }, timeoutMs);

    void consumer.run({
      eachMessage: ({ message }) => {
        if (!message.value) {
          return;
        }

        const decoded = productEventType.toObject(productEventType.decode(message.value), {
          longs: String,
          enums: String,
        });

        if (decoded.eventId === expectedEventId) {
          matchingCount += 1;
        }

        if (matchingCount >= expectedCount) {
          resolve();
        }
      },
    }).catch(reject);
  });

  try {
    await expectedDeliveries;
    process.stdout.write(String(matchingCount));
  } finally {
    clearTimeout(timeout);
    await consumer.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
