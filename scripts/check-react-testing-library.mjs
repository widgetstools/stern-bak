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
 * Scope: `packages/<bucket>/<pkg>` AND `apps/source/<app>`. The apps tree is
 * its own install root and stays outside turbo/lint/coverage, but the rule is
 * about how a React test is written, not about which CI surface it runs on —
 * so a demo app's `.test.tsx` is held to the same bar as a package's.
 *
 * Usage:
 *   node scripts/check-react-testing-library.mjs
 *   node scripts/check-react-testing-library.mjs --report   # never exits non-zero
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');
const APPS_SOURCE_ROOT = join(REPO_ROOT, 'apps', 'source');
const reportOnly = process.argv.includes('--report');

const RTL_IMPORT = /from\s+['"]@testing-library\/react['"]/;
/** A JSX element or fragment — `<Button`, `<div`, `<>`. */
const RENDERS_JSX = /<([A-Za-z][\w.]*)[\s/>]|<>/;
/** A test that stubs the React root is asserting on a bootstrap, not rendering. */
const MOCKS_REACT_ROOT = /vi\.mock\(\s*['"]react-dom\/client['"]/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo']);

/**
 * Strip comments and string/template literals before pattern-matching.
 *
 * Without this the JSX probe fires on markup inside a string — every app
 * bootstrap test writes `document.body.innerHTML = '<div id="root"></div>'`
 * and was reported as un-RTL'd JSX — and the banned-API probes fire on the
 * prose in a file's own header comment.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

/**
 * Ways of rendering a component that are NOT React Testing Library.
 *
 * Each of these lets a test pass while the component is broken for a real user:
 * shallow rendering never runs children, a hand-rolled root bypasses RTL's act()
 * and cleanup, shadow roots hide the tree from RTL's queries, and a markup
 * snapshot asserts that the output has not changed rather than that it is
 * correct.
 */
const BANNED = [
  [/from\s+['"]enzyme['"]/, 'enzyme — shallow rendering never runs children'],
  [/from\s+['"]react-test-renderer['"]/, 'react-test-renderer — asserts on a tree, not on what a user sees'],
  [/from\s+['"]react-dom\/test-utils['"]/, 'react-dom/test-utils — use RTL, which wraps it correctly'],
  [/\bReactDOM\.render\s*\(/, 'ReactDOM.render — bypasses RTL act() and cleanup'],
  [/\bcreateRoot\s*\(/, 'createRoot — render via RTL instead'],
  [/\.attachShadow\s*\(/, 'attachShadow — a shadow root hides the tree from RTL queries'],
  [/\.toMatchSnapshot\s*\(\)/, 'markup snapshot — asserts "unchanged", not "correct"'],
];

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
const bannedUse = [];

/** Every directory holding a package.json, one level under `root`. */
function unitsUnder(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(root, e.name))
    .filter((dir) => existsSync(join(dir, 'package.json')));
}

/** Package dirs: two levels under `packages/`, one under `apps/source/`. */
function allUnits() {
  const out = [];
  for (const bucket of readdirSync(PACKAGES_ROOT, { withFileTypes: true })) {
    if (!bucket.isDirectory()) continue;
    out.push(...unitsUnder(join(PACKAGES_ROOT, bucket.name)));
  }
  out.push(...unitsUnder(APPS_SOURCE_ROOT));
  return out;
}

for (const dir of allUnits()) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

  const tests = findReactTests(dir);
  if (tests.length === 0) continue;

  for (const test of tests) {
    const raw = readFileSync(test, 'utf8');
    const src = code(raw);
    // Only tests that actually render JSX are held to the RTL rule.
    // Import probes read the RAW file — stripping literals also strips the
    // module specifiers they match on.
    if (RENDERS_JSX.test(src) && !RTL_IMPORT.test(raw)) {
      missingImport.push(relative(REPO_ROOT, test));
    }
    // Banned rendering approaches apply to every test file, JSX or not.
    for (const [pattern, why] of BANNED) {
      // A file that stubs `react-dom/client` calls its own mock, not React's
      // root — the thing the rule is about is hand-rolling a real one.
      if (why.startsWith('createRoot') && MOCKS_REACT_ROOT.test(raw)) continue;
      if (pattern.test(src)) bannedUse.push({ file: relative(REPO_ROOT, test), why });
    }
  }

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (!deps['@testing-library/react']) missingDep.push(pkg.name);
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

if (bannedUse.length > 0) {
  w(`\n✗ ${bannedUse.length} test(s) render React by means other than RTL:\n`);
  for (const { file, why } of bannedUse) w(`    ${file}\n      ${why}\n`);
}

if (missingDep.length > 0) {
  w(`\n✗ ${missingDep.length} package(s) ship React tests without declaring @testing-library/react:\n`);
  for (const n of missingDep) w(`    ${n}\n`);
  w('  Relying on the hoisted root copy breaks when the package is built alone.\n');
}

const failed = missingImport.length + missingDep.length + bannedUse.length;
if (failed === 0) w('\nPASS — every React test uses React Testing Library\n');
if (failed > 0 && !reportOnly) process.exit(1);
