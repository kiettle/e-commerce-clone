import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@app/common': resolve(import.meta.dirname, 'libs/common/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.spec.ts'],
  },
});
