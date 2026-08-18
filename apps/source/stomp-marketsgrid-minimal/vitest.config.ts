import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';
import { coverage } from '../../scripts/vitestCoverage.mjs';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: false,
      css: false,
      setupFiles: ['../../test-utils/setup.ts', 'src/test/setupMocks.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: coverage({ exclude: ['src/test/**'] }),
    },
  }),
);
