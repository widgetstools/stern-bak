import { defineConfig } from 'vitest/config';
import { coverage } from '../../../scripts/vitestCoverage.mjs';

// jsdom, not node: BrowserAdapter is built on window, window.open and
// BroadcastChannel.
export default defineConfig({
  test: {
    coverage: coverage(),
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts'],
  },
});
