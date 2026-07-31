import { defineConfig } from 'vitest/config';

/**
 * Vitest config for `@wellsfargo-starui/host-config`.
 *
 * Runs in `jsdom` because Dexie talks to `globalThis.indexedDB`. jsdom 29
 * does not ship IndexedDB — the per-test setup file in `test/setup.ts`
 * pulls in `fake-indexeddb/auto` to install an in-process shim.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    css: false,
  },
});
