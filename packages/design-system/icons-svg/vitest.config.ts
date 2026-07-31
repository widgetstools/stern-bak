import { defineConfig } from 'vitest/config';
import { coverage } from '../../../scripts/vitestCoverage.mjs';

/**
 * icons-svg has no `src/` — its TypeScript is generated barrels at the package
 * root (`index.ts`, `allIcons.ts`, `react/index.ts`, `angular/index.ts`), so the
 * shared `src/**` include matches nothing here and the include is overridden.
 *
 * These files are pure re-exports: importing them executes every line, so the
 * barrel test covers them fully without asserting anything invented.
 */
export default defineConfig({
  test: {
    coverage: coverage({
      include: ['index.ts', 'allIcons.ts', 'react/index.ts', 'angular/index.ts'],
    }),
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
