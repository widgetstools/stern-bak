import { defineConfig } from 'vitest/config';
import { coverage } from '../../scripts/vitestCoverage.mjs';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: coverage(),
  },
});
