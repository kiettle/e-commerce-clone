import { defineConfig } from 'prisma/config';
import { loadEnvFiles } from '../../../libs/common/src/database/prisma-seed';

loadEnvFiles();

const cartDatabaseUrl = process.env.CART_DATABASE_URL;

if (!cartDatabaseUrl) {
  throw new Error('CART_DATABASE_URL is required for cart-service Prisma commands.');
}

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: cartDatabaseUrl,
  },
});
