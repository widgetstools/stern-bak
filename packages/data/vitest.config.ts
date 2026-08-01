import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { coverage } from '../../scripts/vitestCoverage.mjs';

/**
 * Vitest config for `@wellsfargo-starui/data`.
 *
 * Runs in Node-with-DOM-shim (`jsdom`) so `MessageChannel`, `MessageEvent`,
 * and structured-clone are available for protocol tests. The actual
 * `SharedWorker` API is mocked per-test where needed — we don't spin up
 * a real worker process during unit tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@wellsfargo-starui/data': resolve(__dirname, 'host-data/src/index.ts'),
    },
  },
  test: {
    coverage: coverage({
      include: ['host-data/src/**/*.{ts,tsx,js,jsx}'],
    }),
    environment: 'jsdom',
    globals: true,
    include: ['host-data/src/**/*.test.ts'],
    css: false,
  },
});
