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
    name: 'integration',
    reporters: ['default', new LaneReporter('integration')],
    environment: 'node',
    include: [
      'apps/**/*.integration.spec.ts',
      'libs/**/*.integration.spec.ts',
      'tests/integration/**/*.integration.spec.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
