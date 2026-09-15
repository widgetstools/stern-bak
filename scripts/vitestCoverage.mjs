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
  // Harness that only the suite loads: `src/test/setup.ts`, `src/test/providers.tsx`,
  // the per-app `*VitestMocks.ts` / `testSetupMocks.ts` module-mock bundles, and
  // `*.vitest-stub.ts` stand-ins for modules that cannot load under jsdom (the
  // dshub WASM). Same category as `__mocks__` — scoring them says nothing about
  // shipped behaviour, and leaving them unlisted made the inclusion gate below
  // read them as accidental omissions.
  '**/test/**',
  '**/*VitestMocks.{ts,tsx}',
  '**/testSetupMocks.{ts,tsx}',
  '**/*.vitest-stub.{ts,tsx,js,jsx}',

  // No executable statements — v8 reports these as 0% forever.
  '**/*.d.ts',

  // Build output and tool config, never shipped source.
  '**/dist/**',
  '**/node_modules/**',
  '**/*.config.{ts,js,mjs,cjs}',
  '**/vite-env.d.ts',
];

/**
 * Include globs per coverage unit, keyed by the unit's path from the repo root.
 *
 * This map is the SINGLE place the globs live. Each bucket's `vitest.config.ts`
 * reads it via `coverage({ unit })`, and `scripts/check-package-coverage.mjs`
 * reads it to answer the other half of the question — not "is every reported
 * file above the bar" but "is every file on disk reported at all". With the
 * globs written out in the config instead, a member could drop out of the
 * include and the gate would have no way to notice: an unscored file is absent
 * from the report, not a 0% row in it.
 *
 * Buckets need explicit globs because their sources sit one level down, under
 * `<member>/src/`, where the default `src/**` matches nothing. Apps and any
 * single-member package keep the default and are simply absent from this map.
 *
 * `data/host-data-angular` is deliberately NOT here. It is out of the pipeline
 * entirely (not in the root workspaces, not installed, not built — see
 * CLAUDE.md), so scoring it would report 0% on a package nothing can even
 * compile. `check-package-coverage.mjs` skips it by name for the same reason.
 */
export const UNIT_INCLUDE = {
  'packages/core': [
    'engine/src/**/*.{ts,tsx}',
    'host/src/**/*.ts',
    'host-browser/src/**/*.ts',
    'host-config/src/**/*.ts',
    'widget/src/**/*.ts',
    'widget-browser/src/**/*.ts',
  ],
  'packages/data': ['host-data/src/**/*.{ts,tsx,js,jsx}'],
  'packages/design-system': [
    'design-system/src/**/*.{ts,tsx,js,jsx}',
    // icons-svg keeps its generated barrels at the member root, no src/.
    'icons-svg/index.ts',
    'icons-svg/allIcons.ts',
    'icons-svg/react/**/*.{ts,tsx}',
  ],
  'packages/openfin': [
    'host-openfin/src/**/*.{ts,tsx}',
    'openfin-platform/src/**/*.{ts,tsx}',
  ],
  'packages/react-core': [
    'ui/src/**/*.{ts,tsx}',
    'widget-sdk/src/**/*.{ts,tsx}',
    'host-wrapper-react/src/**/*.{ts,tsx}',
    'workspace-setup-react/src/**/*.{ts,tsx}',
    'host-data-react/src/**/*.{ts,tsx}',
  ],
  'packages/react-grid': [
    'grid/src/**/*.{ts,tsx}',
    'config-browser/src/**/*.{ts,tsx}',
    'widgets-react/src/**/*.{ts,tsx}',
  ],
  'packages/types': ['types/src/**/*.ts', 'shared-types/src/**/*.ts'],

  // Apps (`apps/` is its own install root — see docs/APPS_REPO.md). They keep
  // their source under `src/` and so take the default, except this one: the lab
  // ships two first-party profile-writing modules under `scripts/`, which are
  // application code living outside src/, not tool config.
  'apps/source/markets-grid-lab': ['src/**/*.{ts,tsx,js,jsx}', 'scripts/**/*.{ts,js}'],
};

/** The include/exclude a unit is scored by — what the gate and vitest both read. */
export function policyFor(unit) {
  return {
    include: (unit && UNIT_INCLUDE[unit]) ?? INCLUDE,
    exclude: EXCLUDE,
  };
}

/**
 * @param {object} [opts]
 * @param {string} [opts.unit] repo-relative unit path; picks the include globs
 *   out of `UNIT_INCLUDE`. Omit for a unit whose source is under `src/`.
 * @param {number} [opts.lines=70] per-file threshold for lines, statements, functions and branches
 * @param {string[]} [opts.include] REPLACES the include `unit` would select.
 *   Prefer adding an entry to `UNIT_INCLUDE` — globs passed here are invisible
 *   to the inclusion gate, so a file they miss goes unscored and unnoticed.
 * @param {string[]} [opts.exclude] extra excludes, on top of EXCLUDE
 * @param {boolean} [opts.perFile=true] set false only to measure an aggregate
 */
export function coverage(opts = {}) {
  const {
    unit, lines = 70, include = policyFor(unit).include, exclude = [], perFile = true,
  } = opts;
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
