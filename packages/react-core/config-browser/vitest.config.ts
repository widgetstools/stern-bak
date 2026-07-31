import { defineConfig } from 'vitest/config';
import { coverage } from '../../../scripts/vitestCoverage.mjs';

export default defineConfig({
  test: {
    coverage: coverage(),
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // DataGrid mounts a real AG Grid (community + the enterprise status bar)
    // and ConfigBrowser mounts the whole panel; both are well past the 5s
    // default when `npm run test:coverage` runs every package in parallel.
    testTimeout: 15_000,
  },
});
