import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Each test file gets its own module graph — prevents vi.mock collisions
    // on shared packages like `@wellsfargo-starui/host-data-react/runtime`.
    pool: 'forks',
  },
});
