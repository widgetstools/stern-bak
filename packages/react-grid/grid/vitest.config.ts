import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { coverage } from '../../../scripts/vitestCoverage.mjs';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: '@wellsfargo-starui/design-system/adapters/ag-grid',
        replacement: resolve(__dirname, '../../design-system/design-system/dist/adapters/agGrid.js'),
      },
      {
        find: '@wellsfargo-starui/design-system/tokens',
        replacement: resolve(__dirname, '../../design-system/design-system/dist/tokens/index.js'),
      },
      {
        find: '@wellsfargo-starui/design-system',
        replacement: resolve(__dirname, '../../design-system/design-system/dist/index.js'),
      },
      { find: '@wellsfargo-starui/grid/customizer', replacement: resolve(__dirname, 'src/customizer/index.ts') },
      { find: '@wellsfargo-starui/grid', replacement: resolve(__dirname, 'src/index.ts') },
      { find: '@wellsfargo-starui/engine', replacement: resolve(__dirname, '../../shared/engine/src/index.ts') },
      { find: '@wellsfargo-starui/types', replacement: resolve(__dirname, '../../shared/types/src/index.ts') },
      { find: '@wellsfargo-starui/host-openfin', replacement: resolve(__dirname, '../../openfin/host-openfin/src/index.ts') },
      { find: '@wellsfargo-starui/host', replacement: resolve(__dirname, '../../shared/host/src/index.ts') },
      { find: '@wellsfargo-starui/ui', replacement: resolve(__dirname, '../../react-ui/ui/src/index.ts') },
    ],
  },
  test: {
    coverage: coverage({
      exclude: ['src/widget/test/**'],
    }),
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts', './src/test/providers.tsx'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 15_000,
  },
});
