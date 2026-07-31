import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Vitest config for `@wellsfargo-starui/host-data`.
 *
 * Runs in Node-with-DOM-shim (`jsdom`) so `MessageChannel`, `MessageEvent`,
 * and structured-clone are available for protocol tests. The actual
 * `SharedWorker` API is mocked per-test where needed — we don't spin up
 * a real worker process during unit tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@wellsfargo-starui/host-data': resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    css: false,
  },
});
