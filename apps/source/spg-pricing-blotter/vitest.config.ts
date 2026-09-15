import { coverage } from '@wellsfargo-starui/platform/scripts/vitestCoverage.mjs';
import react from '@vitejs/plugin-react';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    plugins: [react()],
    resolve: { dedupe: ['react', 'react-dom'] },
    test: {
      environment: 'jsdom',
      globals: false,
      css: false,
      setupFiles: ['../../test-utils/setup.ts', 'src/testSetupMocks.tsx'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: coverage(),
    },
  }),
);
