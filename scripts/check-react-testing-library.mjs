#!/usr/bin/env node
/**
 * check-react-testing-library.mjs — React components must be tested through
 * React Testing Library, not by poking at internals.
 *
 * Two rules, both narrow enough to have no false positives:
 *
 *   1. A test file that **renders JSX** must import from
 *      `@testing-library/react`. Rendering by hand (ReactDOM.render, a bespoke
 *      harness, shallow rendering) asserts on implementation rather than on
 *      what a user sees.
 *
 *      Keyed on JSX presence, not the .tsx extension: a `.test.tsx` that only
 *      exercises a pure helper exported from a `.tsx` module renders nothing
 *      and legitimately needs no RTL — e.g. ColumnsTab.test.tsx testing
 *      `removeColumnDefinition`.
 *
 *   2. Every package containing a `*.test.tsx` must declare
 *      `@testing-library/react` as a devDependency. Relying on the hoisted
 *      root copy works locally and breaks the moment the package is built or
 *      consumed on its own.
 *
 * Deliberately NOT enforced: that a component has a test at all — that is what
 * the coverage gate (check-package-coverage.mjs) is for. This script only
 * governs HOW a React test is written once it exists.
 *
 * Usage:
 *   node scripts/check-react-testing-library.mjs
 *   node scripts/check-react-testing-library.mjs --report   # never exits non-zero
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');
const reportOnly = process.argv.includes('--report');

const RTL_IMPORT = /from\s+['"]@testing-library\/react['"]/;
/** A JSX element or fragment — `<Button`, `<div`, `<>`. */
const RENDERS_JSX = /<([A-Za-z][\w.]*)[\s/>]|<>/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo']);

/** Every `*.test.tsx` beneath `dir`. */
function findReactTests(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { findReactTests(path, out); continue; }
    if (entry.name.endsWith('.test.tsx')) out.push(path);
  }
  return out;
}

const missingImport = [];
const missingDep = [];

for (const bucket of readdirSync(PACKAGES_ROOT, { withFileTypes: true })) {
  if (!bucket.isDirectory()) continue;
  for (const entry of readdirSync(join(PACKAGES_ROOT, bucket.name), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(PACKAGES_ROOT, bucket.name, entry.name);
    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

    const tests = findReactTests(dir);
    if (tests.length === 0) continue;

    for (const test of tests) {
      const src = readFileSync(test, 'utf8');
      // Only tests that actually render JSX are held to the RTL rule.
      if (RENDERS_JSX.test(src) && !RTL_IMPORT.test(src)) {
        missingImport.push(relative(REPO_ROOT, test));
      }
    }

    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    if (!deps['@testing-library/react']) missingDep.push(pkg.name);
  }
}

const w = (s) => process.stdout.write(s);

if (missingImport.length > 0) {
  w(`\n✗ ${missingImport.length} React test file(s) do not use React Testing Library:\n`);
  for (const f of missingImport) w(`    ${f}\n`);
  w('\n  A .test.tsx should render the component and assert on what a user sees:\n');
  w("    import { render, screen } from '@testing-library/react';\n");
  w("    render(<Button variant=\"primary\">Save</Button>);\n");
  w("    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();\n");
}

if (missingDep.length > 0) {
  w(`\n✗ ${missingDep.length} package(s) ship React tests without declaring @testing-library/react:\n`);
  for (const n of missingDep) w(`    ${n}\n`);
  w('  Relying on the hoisted root copy breaks when the package is built alone.\n');
}

const failed = missingImport.length + missingDep.length;
if (failed === 0) w('\nPASS — every React test uses React Testing Library\n');
if (failed > 0 && !reportOnly) process.exit(1);
