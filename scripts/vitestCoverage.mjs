/**
 * vitestCoverage.mjs — one coverage policy for every package.
 *
 * Imported by each package's `vitest.config.ts` so the threshold, the provider
 * and the include/exclude rules live in exactly one place:
 *
 *     import { defineConfig } from 'vitest/config';
 *     import { coverage } from '../../../scripts/vitestCoverage.mjs';
 *
 *     export default defineConfig({
 *       test: { environment: 'jsdom', coverage: coverage() },
 *     });
 *
 * Policy: **70% per FILE on lines, statements, functions and branches**, not per
 * package. `perFile: true` is the whole point — a package-level average lets a
 * well-tested module hide a completely untested neighbour, which is exactly
 * what this is meant to prevent.
 *
 * (`docs/package-coverage-and-sonar-lcov.md` suggests 60% as a per-package
 * baseline for a *new* package. 70% per file is the deliberately stricter bar
 * asked for here; raising the doc's number is a separate decision.)
 *
 * `all: true` matters just as much: without it v8 only reports files some test
 * actually imported, so a package with one trivial test can report 100% while
 * most of its source is never loaded. With `all`, untested files show up as 0%
 * and count against the gate.
 *
 * `lcov` is non-negotiable in the reporter list: `scripts/run-test-coverage.mjs`
 * merges every package's `coverage/lcov.info` into the repo-root
 * `coverage/lcov.info` that Sonar reads.
 */

/** Source that is real, testable application code. */
const INCLUDE = ['src/**/*.{ts,tsx,js,jsx}'];

/**
 * Excluded from the gate. Each entry is here because a coverage number for it
 * would be noise, not because it is inconvenient to test.
 */
const EXCLUDE = [
  // Tests and fixtures themselves.
  '**/*.{test,spec}.{ts,tsx,js,jsx}',
  // vitest bench() files — run by `npm run bench`, not shipped logic.
  '**/*.bench.{ts,tsx,js,jsx}',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/__fixtures__/**',
  '**/test-utils/**',
  '**/testUtils/**',

  // No executable statements — v8 reports these as 0% forever.
  '**/*.d.ts',

  // Build output and tool config, never shipped source.
  '**/dist/**',
  '**/node_modules/**',
  '**/*.config.{ts,js,mjs,cjs}',
  '**/vite-env.d.ts',
];

/**
 * @param {object} [opts]
 * @param {number} [opts.lines=70] per-file threshold for lines, statements, functions and branches
 * @param {string[]} [opts.include] REPLACES the default `src/**` include. Needed
 *   by packages whose source is not under src/ — icons-svg keeps its generated
 *   barrels at the package root, where the default matches nothing and coverage
 *   silently reports 0/0.
 * @param {string[]} [opts.exclude] extra excludes, on top of EXCLUDE
 * @param {boolean} [opts.perFile=true] set false only to measure an aggregate
 */
export function coverage(opts = {}) {
  const { lines = 70, include = INCLUDE, exclude = [], perFile = true } = opts;
  return {
    provider: 'v8',
    all: true,
    include,
    exclude: [...EXCLUDE, ...exclude],
    // lcov feeds the Sonar merge; json-summary feeds check-package-coverage.
    reporter: ['text-summary', 'json-summary', 'lcov'],
    reportsDirectory: './coverage',
    thresholds: {
      perFile,
      lines,
      statements: lines,
      functions: lines,
      branches: lines,
    },
  };
}

export { INCLUDE as COVERAGE_INCLUDE, EXCLUDE as COVERAGE_EXCLUDE };
