import { defineConfig } from 'vitest/config';
import { coverage } from '../../scripts/vitestCoverage.mjs';

export default defineConfig({
  test: {
    coverage: coverage({
      include: [
        'design-system/src/**/*.{ts,tsx,js,jsx}',
        'icons-svg/index.ts',
        'icons-svg/allIcons.ts',
        'icons-svg/react/**/*.{ts,tsx}',
      ],
    }),
    environment: 'jsdom',
    include: [
      'design-system/tests/**/*.test.ts',
      'design-system/src/**/*.test.ts',
      'icons-svg/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    snapshotFormat: { printBasicPrototype: false },
  },
});
