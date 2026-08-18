/**
 * vitestCoverage.mjs — one coverage policy for every app, mirroring
 * `scripts/vitestCoverage.mjs` in the platform repo.
 *
 * Apps had drifted: nine configs, each with its own include/exclude list, none
 * with `all: true`, thresholds applied to the AGGREGATE rather than per file,
 * and one app (`design-system`) quietly running a 60% branch bar. That
 * combination flatters: without `all` v8 reports only files a test actually
 * imported, so an untested module vanishes from the denominator instead of
 * showing 0%, and an aggregate lets a well-covered file carry an untested
 * neighbour.
 *
 * Policy, identical to the packages one: **70% per FILE on lines, statements,
 * functions and branches**, measured over every source file whether a test
 * imported it or not.
 *
 * `lcov` is required in the reporter list — `apps/scripts/run-test-coverage.mjs`
 * merges each app's `coverage/lcov.info`.
 */

/** Source that is real, testable application code. */
const INCLUDE = ['src/**/*.{ts,tsx,js,jsx}'];

/**
 * Excluded from the gate. Each entry earns its place: a coverage number for it
 * would be noise, not a gap worth closing.
 */
const EXCLUDE = [
  // Tests, fixtures and the mock harnesses that exist only to serve them.
  '**/*.{test,spec}.{ts,tsx,js,jsx}',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/__fixtures__/**',
  '**/test-utils/**',
  '**/testSetupMocks.{ts,tsx}',
  '**/staruiVitestMocks.{ts,tsx}',
  // No executable statements — v8 reports these as 0% forever.
  '**/*.d.ts',
  '**/vite-env.d.ts',
  // Build output and tool config, never shipped source. Two apps used to pull
  // `vite.config.ts` / `tailwind.config.js` INTO coverage, which measures the
  // build rather than the app.
  '**/dist/**',
  '**/node_modules/**',
  '**/*.config.{ts,js,mjs,cjs}',
];

/**
 * @param {object} [opts]
 * @param {number} [opts.lines=70] per-file threshold for all four metrics
 * @param {string[]} [opts.include] REPLACES the default `src/**` include
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
    reporter: ['text-summary', 'json-summary', 'lcov'],
    reportsDirectory: './coverage',
    reportOnFailure: true,
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
