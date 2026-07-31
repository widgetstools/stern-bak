import { defineConfig } from 'vitest/config';
import { coverage } from '../../../scripts/vitestCoverage.mjs';

/**
 * Vitest config for `@wellsfargo-starui/openfin-platform`.
 *
 * Runs in `jsdom` so the workspace-persistence override can use a fetch-
 * style URL parser when extracting instanceIds, and so any DOM-shape test
 * helpers work. The OpenFin runtime (`fin` global) and the parent
 * WorkspacePlatformProvider class are stubbed per-test — we never spin up
 * a real OpenFin platform during unit tests.
 */
export default defineConfig({
  test: {
    coverage: coverage(),
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    css: false,
  },
});
