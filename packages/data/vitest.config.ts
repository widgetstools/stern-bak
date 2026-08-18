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
    // The worker-entry tests (`defaultEntry*.test.ts`) call `vi.resetModules()`
    // and then re-`import()` the entry, which recompiles a module graph inside
    // the test body. On an idle machine that is milliseconds; across this
    // package's 67 files in parallel it is seconds — a full run reports ~60s of
    // import and ~37s of transform — and the 5s default then trips. It passed
    // three times in isolation while failing the full run, and a CI runner is
    // slower than this box, not faster.
    //
    // Matches the precedent already set for the other heavy packages: `core`
    // 10s, `react-grid` 15s.
    testTimeout: 15_000,
  },
});
