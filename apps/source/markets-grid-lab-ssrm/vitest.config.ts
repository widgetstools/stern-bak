import { coverage } from '@wellsfargo-starui/platform/scripts/vitestCoverage.mjs';
import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    plugins: [react()],
    // The shared lab modules import Radix through the root install; without
    // dedupe the test graph loads a second React and every hook dies with
    // "Cannot read properties of null (reading 'useRef')".
    resolve: { dedupe: ['react', 'react-dom'] },
    test: {
      environment: 'jsdom',
      globals: false,
      css: false,
      setupFiles: ['../../test-utils/setup.ts', '../markets-grid-lab/src/testSetupMocks.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: coverage(),
    },
  }),
);
