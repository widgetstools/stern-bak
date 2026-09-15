import { defineConfig } from 'vitest/config';
import { coverage } from '../../scripts/vitestCoverage.mjs';

export default defineConfig({
  test: {
    coverage: coverage({ unit: 'packages/design-system' }),
    environment: 'jsdom',
    include: [
      'design-system/tests/**/*.test.ts',
      'design-system/src/**/*.test.ts',
      'icons-svg/**/*.test.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    snapshotFormat: { printBasicPrototype: false },
  },
});
