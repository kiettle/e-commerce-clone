import { defineConfig } from 'prisma/config';
import { loadEnvFiles } from '../../../libs/common/src/database/prisma-seed';

loadEnvFiles();

const inventoryDatabaseUrl = process.env.INVENTORY_DATABASE_URL;

if (!inventoryDatabaseUrl) {
  throw new Error(
    'INVENTORY_DATABASE_URL is required for inventory-service Prisma commands.',
  );
}

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: inventoryDatabaseUrl,
  },
});
