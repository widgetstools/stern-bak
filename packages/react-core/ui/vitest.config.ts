import { defineConfig } from 'vitest/config';
import { coverage } from '../../../scripts/vitestCoverage.mjs';

export default defineConfig({
  test: {
    coverage: coverage(),
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
