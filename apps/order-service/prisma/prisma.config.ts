import { defineConfig } from 'prisma/config';
import { loadEnvFiles } from '../../../libs/common/src/database/prisma-seed';

loadEnvFiles();

const orderDatabaseUrl = process.env.ORDER_DATABASE_URL;

if (!orderDatabaseUrl) {
  throw new Error('ORDER_DATABASE_URL is required for order-service Prisma commands.');
}

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: orderDatabaseUrl,
  },
});
