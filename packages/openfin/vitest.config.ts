import { defineConfig } from 'vitest/config';
import { coverage } from '../../scripts/vitestCoverage.mjs';

/**
 * Vitest config for `@wellsfargo-starui/openfin`.
 *
 * Runs in `jsdom` so the workspace-persistence override can use a fetch-
 * style URL parser when extracting instanceIds, and so any DOM-shape test
 * helpers work. The OpenFin runtime (`fin` global) and the parent
 * WorkspacePlatformProvider class are stubbed per-test — we never spin up
 * a real OpenFin platform during unit tests.
 */
export default defineConfig({
  test: {
    coverage: coverage({
      include: [
        'host-openfin/src/**/*.{ts,tsx}',
        'openfin-platform/src/**/*.{ts,tsx}',
      ],
    }),
    environment: 'jsdom',
    globals: true,
    include: [
      'host-openfin/src/**/*.test.ts',
      'openfin-platform/src/**/*.test.ts',
    ],
    css: false,
  },
});
