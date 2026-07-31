import { defineConfig } from 'vitest/config';
import { coverage } from '../../../scripts/vitestCoverage.mjs';

export default defineConfig({
  test: {
    coverage: coverage(),
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // The IconPicker grid is 245 buttons and the WorkspaceSetup shell renders
    // all three panes at once, so a single interaction is genuinely expensive.
    // The 5s default is enough when this package runs alone but not when
    // `npm run test:coverage` runs 62 turbo tasks in parallel.
    testTimeout: 15_000,
  },
});
