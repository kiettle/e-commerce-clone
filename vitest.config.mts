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
    name: 'unit',
    reporters: ['default', new LaneReporter('unit')],
    environment: 'node',
    include: ['apps/**/*.spec.ts', 'libs/**/*.spec.ts'],
    exclude: ['**/*.contract.spec.ts', '**/*.integration.spec.ts', '**/*.e2e.spec.ts'],
    testTimeout: 5_000,
    hookTimeout: 10_000,
  },
});
