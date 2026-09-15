import { coverage } from '@wellsfargo-starui/platform/scripts/vitestCoverage.mjs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: coverage(),
  },
});
