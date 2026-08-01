import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig, type UserConfig } from 'vitest/config';

type AppVitestOptions = {
  environment?: 'node' | 'jsdom';
  viteConfig?: UserConfig;
  setupFiles?: string[];
};

const defaultCoverage = {
  provider: 'v8' as const,
  include: ['src/**/*.{ts,tsx,js,jsx}', 'scripts/**/*.{ts,js}'],
  exclude: [
    'src/**/*.test.{ts,tsx,js,jsx}',
    'src/**/*.spec.{ts,tsx,js,jsx}',
    'src/**/__tests__/**',
    'src/vite-env.d.ts',
    'src/types/**',
  ],
  reporter: ['text', 'json-summary', 'lcov'] as const,
  thresholds: {
    lines: 70,
    statements: 70,
    functions: 70,
    branches: 70,
  },
};

export function createAppVitestConfig(options: AppVitestOptions = {}) {
  const { environment = 'jsdom', viteConfig, setupFiles = ['../../test-utils/setup.ts'] } = options;

  return mergeConfig(
    viteConfig ?? defineConfig({ plugins: [react()] }),
    defineConfig({
      test: {
        environment,
        globals: false,
        css: false,
        setupFiles,
        include: ['src/**/*.test.{ts,tsx,js,jsx}', 'scripts/**/*.test.ts'],
        coverage: defaultCoverage,
      },
    }),
  );
}

export function createNodeVitestConfig() {
  return defineConfig({
    test: {
      environment: 'node',
      globals: false,
      include: ['src/**/*.test.ts'],
      coverage: {
        ...defaultCoverage,
        include: ['src/**/*.{ts,js}'],
      },
    },
  });
}
