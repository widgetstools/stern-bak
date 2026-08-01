import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { coverage } from '../../scripts/vitestCoverage.mjs';

/**
 * Vitest config for `@wellsfargo-starui/grid` (grid + config-browser + widgets-react).
 *
 * Each former member kept a materially different test setup (globals, setupFiles,
 * pool), so this uses `test.projects` instead of one flat config — each project
 * gets its own `root`, which is what setupFiles/include below resolve against.
 * Coverage is collected once for the whole run from the top-level `coverage` block
 * (Vitest ignores per-project coverage overrides), spanning all three src trees.
 */
export default defineConfig({
  test: {
    coverage: {
      ...coverage({
        include: [
          'grid/src/**/*.{ts,tsx}',
          'config-browser/src/**/*.{ts,tsx}',
          'widgets-react/src/**/*.{ts,tsx}',
        ],
        exclude: ['grid/src/**/test/**'],
      }),
      // Avoid mid-run wipe when another vitest touches the same reportsDirectory.
      clean: false,
    },
    projects: [
      {
        extends: true,
        plugins: [react()],
        resolve: {
          dedupe: ['react', 'react-dom'],
          alias: [
            {
              find: '@wellsfargo-starui/design-system/adapters/ag-grid',
              replacement: resolve(__dirname, '../design-system/design-system/dist/adapters/agGrid.js'),
            },
            {
              find: '@wellsfargo-starui/design-system/tokens',
              replacement: resolve(__dirname, '../design-system/design-system/dist/tokens/index.js'),
            },
            {
              find: '@wellsfargo-starui/design-system/icons/all-icons',
              replacement: resolve(__dirname, '../design-system/icons-svg/dist/allIcons.js'),
            },
            {
              find: '@wellsfargo-starui/design-system',
              replacement: resolve(__dirname, '../design-system/design-system/dist/index.js'),
            },
            { find: '@wellsfargo-starui/grid/customizer', replacement: resolve(__dirname, 'grid/src/customizer/index.ts') },
            { find: '@wellsfargo-starui/grid', replacement: resolve(__dirname, 'grid/src/index.ts') },
            { find: '@wellsfargo-starui/core/host/config', replacement: resolve(__dirname, '../core/host-config/src/index.ts') },
            { find: '@wellsfargo-starui/core/host/browser', replacement: resolve(__dirname, '../core/host-browser/src/index.ts') },
            { find: '@wellsfargo-starui/core/widget/browser', replacement: resolve(__dirname, '../core/widget-browser/src/index.ts') },
            { find: '@wellsfargo-starui/core/widget', replacement: resolve(__dirname, '../core/widget/src/index.ts') },
            { find: '@wellsfargo-starui/core/host', replacement: resolve(__dirname, '../core/host/src/index.ts') },
            { find: '@wellsfargo-starui/core', replacement: resolve(__dirname, '../core/engine/src/index.ts') },
            { find: '@wellsfargo-starui/types/shared/configuration', replacement: resolve(__dirname, '../types/shared-types/src/configuration.ts') },
            { find: '@wellsfargo-starui/types/shared/dataProvider', replacement: resolve(__dirname, '../types/shared-types/src/dataProvider.ts') },
            { find: '@wellsfargo-starui/types/shared/fieldSelector', replacement: resolve(__dirname, '../types/shared-types/src/fieldSelector.ts') },
            { find: '@wellsfargo-starui/types/shared', replacement: resolve(__dirname, '../types/shared-types/src/index.ts') },
            { find: '@wellsfargo-starui/types', replacement: resolve(__dirname, '../types/types/src/index.ts') },
            { find: '@wellsfargo-starui/openfin/host', replacement: resolve(__dirname, '../openfin/host-openfin/src/index.ts') },
            { find: '@wellsfargo-starui/react', replacement: resolve(__dirname, '../react-core/ui/src/index.ts') },
          ],
        },
        test: {
          name: 'grid',
          root: './grid',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.ts', './src/test/providers.tsx'],
          include: ['src/**/*.test.{ts,tsx}'],
          css: false,
          testTimeout: 15_000,
          // Serialise file execution — 237 suites racing on coverage/.tmp loses shards.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'config-browser',
          root: './config-browser',
          environment: 'jsdom',
          globals: false,
          include: ['src/**/*.test.{ts,tsx}'],
          css: false,
          // DataGrid mounts a real AG Grid (community + the enterprise status bar)
          // and ConfigBrowser mounts the whole panel; both are well past the 5s
          // default when `npm run test:coverage` runs every package in parallel.
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'widgets-react',
          root: './widgets-react',
          environment: 'jsdom',
          globals: false,
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          css: false,
          // Each test file gets its own module graph — prevents vi.mock collisions
          // on shared packages like `@wellsfargo-starui/react/data/runtime`.
          pool: 'forks',
        },
      },
    ],
  },
});
