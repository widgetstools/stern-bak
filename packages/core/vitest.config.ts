import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { coverage } from '../../scripts/vitestCoverage.mjs';

/**
 * Vitest config for `@wellsfargo-starui/core` (engine + host + host-browser +
 * host-config + widget + widget-browser).
 *
 * The former members kept materially different test settings (environment,
 * globals, setupFiles, timeouts), so this uses `test.projects` — each project
 * gets its own `root`, which is what setupFiles/include resolve against.
 * Coverage is collected once for the whole run from the top-level block
 * (Vitest ignores per-project coverage overrides), spanning all six src trees.
 */
export default defineConfig({
  test: {
    coverage: coverage({
      include: [
        'engine/src/**/*.{ts,tsx}',
        'host/src/**/*.ts',
        'host-browser/src/**/*.ts',
        'host-config/src/**/*.ts',
        'widget/src/**/*.ts',
        'widget-browser/src/**/*.ts',
      ],
    }),
    projects: [
      {
        extends: true,
        resolve: {
          alias: {
            '@': resolve(__dirname, 'engine/src'),
            // Self-imports in engine src/ use the package name; map to source.
            '@wellsfargo-starui/core': resolve(__dirname, 'engine/src/index.ts'),
          },
        },
        test: {
          name: 'engine',
          root: './engine',
          environment: 'jsdom',
          globals: true,
          include: ['src/**/*.test.{ts,tsx}'],
          css: false,
          testTimeout: 10_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'host',
          root: './host',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'host-browser',
          root: './host-browser',
          environment: 'jsdom',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          // jsdom because Dexie talks to globalThis.indexedDB; jsdom 29 does
          // not ship IndexedDB, so test/setup.ts installs fake-indexeddb.
          name: 'host-config',
          root: './host-config',
          environment: 'jsdom',
          globals: true,
          include: ['src/**/*.test.ts'],
          setupFiles: ['./test/setup.ts'],
          css: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'widget',
          root: './widget',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          // jsdom, not node: BrowserAdapter is built on window, window.open
          // and BroadcastChannel.
          name: 'widget-browser',
          root: './widget-browser',
          environment: 'jsdom',
          globals: false,
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
});
