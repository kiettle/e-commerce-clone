import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnvFiles } from '@app/common';
import { PrismaClient } from '../../../prisma/generated/product';
import { ReplayProductOutboxEventUseCase } from './catalog/application/use-cases/replay-product-outbox-event.use-case';
import { runProductOutboxReplayCli } from './catalog/infrastructure/cli/product-outbox-replay.cli';
import { PrismaProductOutboxRepository } from './catalog/infrastructure/persistence/prisma/product-outbox.prisma.repository';
import { PrismaService } from './catalog/infrastructure/persistence/prisma/prisma.service';

async function main(): Promise<void> {
  const eventId = process.argv[2];

  if (!eventId || process.argv.length !== 3) {
    console.error('Usage: npm run outbox:replay:product -- <event-id>');
    process.exitCode = 1;
    return;
  }

  loadEnvFiles();
  const databaseUrl = process.env.PRODUCT_DATABASE_URL;

  if (!databaseUrl) {
    console.error('PRODUCT_DATABASE_URL is required.');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const repository = new PrismaProductOutboxRepository(prisma as unknown as PrismaService);
  const replay = new ReplayProductOutboxEventUseCase(repository);

  try {
    process.exitCode = await runProductOutboxReplayCli(eventId, replay);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Product outbox replay failed.');
  process.exitCode = 1;
});
