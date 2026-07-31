import { defineConfig } from 'vitest/config';
import { coverage } from '../../../scripts/vitestCoverage.mjs';

export default defineConfig({
  test: {
    coverage: coverage(),
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    snapshotFormat: { printBasicPrototype: false },
  },
});
