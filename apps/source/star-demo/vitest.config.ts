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
      // The app-boot tests (main/Provider) render the whole router and
      // dynamically import route chunks; vitest's 5s default is too tight for
      // that on slower machines and produces flaky timeouts unrelated to the
      // code under test.
      testTimeout: 20_000,
      setupFiles: ['../../test-utils/setup.ts', 'src/staruiVitestMocks.ts'],
      include: ['src/**/*.test.{ts,tsx}', '*.test.ts', '*.test.js'],
      coverage: {
        provider: 'v8',
        include: [
          'src/**/*.{ts,tsx,js,jsx}',
          'vite.config.ts',
          'tailwind.config.js',
          'postcss.config.cjs',
        ],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/types/**',
          'src/vite-env.d.ts',
          'src/staruiVitestMocks.ts',
        ],
        reporter: ['text', 'json-summary', 'lcov'],
        reportOnFailure: true,
        thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 },
      },
    },
  }),
);
