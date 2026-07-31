import { defineConfig } from 'vitest/config';
import { coverage } from '../../../scripts/vitestCoverage.mjs';

export default defineConfig({
  test: {
    coverage: coverage(),
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Each test file gets its own module graph — prevents vi.mock collisions
    // on shared packages like `@wellsfargo-starui/host-data-react/runtime`.
    pool: 'forks',
  },
});
