import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: false,
      css: false,
      setupFiles: ['../../test-utils/setup.ts', 'src/testSetupMocks.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx,js,jsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/vite-env.d.ts', 'src/testSetupMocks.ts'],
        reporter: ['text', 'json-summary', 'lcov'],
        reportOnFailure: true,
        thresholds: { lines: 70, statements: 70, functions: 70, branches: 60 },
      },
    },
  }),
);
