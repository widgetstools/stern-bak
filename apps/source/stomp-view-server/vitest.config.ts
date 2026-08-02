import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,js}'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'json-summary', 'lcov'],
        reportOnFailure: true,
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 },
    },
  },
});
