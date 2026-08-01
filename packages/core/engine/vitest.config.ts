import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { coverage } from '../../../scripts/vitestCoverage.mjs';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@wellsfargo-starui/engine': resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    coverage: coverage(),
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 10_000,
  },
});
