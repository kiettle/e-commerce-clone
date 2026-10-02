import { defineConfig } from 'prisma/config';
import { loadEnvFiles } from '../../../libs/common/src/database/prisma-seed';

loadEnvFiles();

const productDatabaseUrl = process.env.PRODUCT_DATABASE_URL;

if (!productDatabaseUrl) {
  throw new Error('PRODUCT_DATABASE_URL is required for product-service Prisma commands.');
}

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: productDatabaseUrl,
  },
});
