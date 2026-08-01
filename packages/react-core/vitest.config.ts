import { defineConfig } from 'vitest/config';
import { coverage } from '../../scripts/vitestCoverage.mjs';

/**
 * Vitest config for `@wellsfargo-starui/react` (ui + widget-sdk +
 * host-wrapper-react + workspace-setup-react + host-data-react).
 *
 * The former members kept materially different test settings (globals,
 * setupFiles, timeouts), so this uses `test.projects` — each project gets its
 * own `root`, which is what setupFiles/include resolve against. Coverage is
 * collected once for the whole run from the top-level block (Vitest ignores
 * per-project coverage overrides), spanning all five src trees.
 */
export default defineConfig({
  test: {
    coverage: coverage({
      include: [
        'ui/src/**/*.{ts,tsx}',
        'widget-sdk/src/**/*.{ts,tsx}',
        'host-wrapper-react/src/**/*.{ts,tsx}',
        'workspace-setup-react/src/**/*.{ts,tsx}',
        'host-data-react/src/**/*.{ts,tsx}',
      ],
    }),
    projects: [
      {
        extends: true,
        test: {
          name: 'ui',
          root: './ui',
          environment: 'jsdom',
          globals: false,
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          css: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'widget-sdk',
          root: './widget-sdk',
          environment: 'jsdom',
          globals: false,
          include: ['src/**/*.test.{ts,tsx}'],
          css: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'host-wrapper',
          root: './host-wrapper-react',
          environment: 'jsdom',
          globals: false,
          include: ['src/**/*.test.{ts,tsx}'],
          css: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'workspace-setup',
          root: './workspace-setup-react',
          environment: 'jsdom',
          globals: false,
          include: ['src/**/*.test.{ts,tsx}'],
          css: false,
          // The IconPicker grid is 245 buttons and the WorkspaceSetup shell renders
          // all three panes at once, so a single interaction is genuinely expensive.
          // The 5s default is enough when this package runs alone but not when
          // `npm run test:coverage` runs every turbo task in parallel.
          testTimeout: 15_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'host-data',
          root: './host-data-react',
          environment: 'jsdom',
          globals: true,
          include: ['src/**/*.test.{ts,tsx}'],
          css: false,
        },
      },
    ],
  },
});
