import { defineConfig } from 'vitest/config';
import { coverage } from '../../scripts/vitestCoverage.mjs';

/**
 * Vitest config for `@wellsfargo-starui/types` (types + shared-types).
 *
 * Both members ran identical node-environment configs before the collapse, but
 * `test.projects` keeps each member's `root` so include globs and coverage
 * paths stay member-relative — matching the other collapsed buckets.
 */
export default defineConfig({
  test: {
    coverage: coverage({
      include: ['types/src/**/*.ts', 'shared-types/src/**/*.ts'],
    }),
    projects: [
      {
        extends: true,
        test: {
          name: 'types',
          root: './types',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'shared-types',
          root: './shared-types',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
    ],
  },
});
