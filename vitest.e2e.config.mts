import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { LaneReporter } from './tests/support/lane-reporter.mjs';

export default defineConfig({
  resolve: {
    alias: {
      '@app/common': resolve(import.meta.dirname, 'libs/common/src'),
    },
  },
  test: {
    name: 'e2e',
    reporters: ['default', new LaneReporter('e2e')],
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.spec.ts'],
    testTimeout: 240_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
