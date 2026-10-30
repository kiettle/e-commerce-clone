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
    include: ['apps/**/*.spec.ts', 'libs/**/*.spec.ts', 'frontend/src/**/*.spec.ts'],
    exclude: ['**/*.contract.spec.ts', '**/*.integration.spec.ts', '**/*.e2e.spec.ts'],
    testTimeout: 5_000,
    hookTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage/unit',
      exclude: [
        '**/*.spec.ts',
        '**/*.contract.spec.ts',
        '**/*.integration.spec.ts',
        '**/*.e2e.spec.ts',
        '**/prisma/generated/**',
      ],
      thresholds: {
        statements: 70,
        lines: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
