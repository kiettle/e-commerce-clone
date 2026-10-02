import { defineConfig } from 'prisma/config';
import { loadEnvFiles } from '../../../libs/common/src/database/prisma-seed';

loadEnvFiles();

const authDatabaseUrl = process.env.AUTH_DATABASE_URL;

if (!authDatabaseUrl) {
  throw new Error('AUTH_DATABASE_URL is required for auth-service Prisma commands.');
}

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: authDatabaseUrl,
  },
});
