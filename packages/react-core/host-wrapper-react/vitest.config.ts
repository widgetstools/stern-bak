import { defineConfig } from 'vitest/config';
import { coverage } from '../../../scripts/vitestCoverage.mjs';

export default defineConfig({
  test: {
    coverage: coverage(),
    environment: 'jsdom',
    globals: false,
  },
});
