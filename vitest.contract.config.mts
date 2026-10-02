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
    name: 'contract',
    reporters: ['default', new LaneReporter('contract')],
    environment: 'node',
    include: [
      'apps/**/*.contract.spec.ts',
      'libs/**/*.contract.spec.ts',
      'tests/contract/**/*.contract.spec.ts',
    ],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
