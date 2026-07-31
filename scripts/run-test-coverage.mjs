#!/usr/bin/env node
/**
 * run-test-coverage.mjs — package coverage for Sonar.
 *
 * Sonar reads exactly one file, `coverage/lcov.info` at the repo root (see
 * sonar-project.properties). Vitest writes one LCOV per package, so this:
 *
 *   1. runs `npx turbo test` across every package, passing the coverage
 *      reporters through to each package's vitest;
 *   2. scans `packages/<bucket>/<pkg>/coverage/lcov.info`;
 *   3. rewrites each `SF:` record to a **repo-relative** path — Sonar resolves
 *      sources against the project root, and vitest emits absolute paths, which
 *      Sonar silently drops as unmatched files;
 *   4. concatenates the result into `coverage/lcov.info`.
 *
 * Usage:
 *   npm run test:coverage
 *   npm run test:coverage -- --filter=@wellsfargo-starui/grid
 *
 * Extra args are forwarded to turbo, so `--filter` works as usual.
 */
import { execSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');
const OUT_DIR = join(REPO_ROOT, 'coverage');
const OUT_FILE = join(OUT_DIR, 'lcov.info');

const passthrough = process.argv.slice(2);

function log(msg) {
  process.stdout.write(`[test-coverage] ${msg}\n`);
}

// ── 1. run the suites ──────────────────────────────────────────────────────
// Reporters are passed here rather than baked into each package so a package
// that only defines `"test": "vitest run"` still produces LCOV.
const vitestArgs = [
  '--coverage',
  '--coverage.reporter=text',
  '--coverage.reporter=json-summary',
  '--coverage.reporter=lcov',
].join(' ');

// --continue is essential: the per-file threshold makes a package exit
// non-zero, and without it turbo halts on the first one, so most packages never
// run and the merged LCOV silently covers only a fraction of the repo.
const turboCmd = `npx turbo test --continue ${passthrough.join(' ')} -- ${vitestArgs}`
  .replace(/\s+/g, ' ');
log(`> ${turboCmd}`);

let testsFailed = false;
try {
  execSync(turboCmd, { cwd: REPO_ROOT, stdio: 'inherit' });
} catch {
  // Keep going: a failing suite still leaves usable LCOV, and Sonar wants the
  // report even on a red build. The non-zero exit is re-raised at the end.
  testsFailed = true;
  log('turbo test exited non-zero — merging whatever coverage was produced');
}

// ── 2. collect package LCOVs ───────────────────────────────────────────────
function findLcovFiles() {
  const found = [];
  if (!existsSync(PACKAGES_ROOT)) return found;
  for (const bucket of readdirSync(PACKAGES_ROOT, { withFileTypes: true })) {
    if (!bucket.isDirectory()) continue;
    const bucketDir = join(PACKAGES_ROOT, bucket.name);
    for (const pkg of readdirSync(bucketDir, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const lcov = join(bucketDir, pkg.name, 'coverage', 'lcov.info');
      if (existsSync(lcov)) found.push(lcov);
    }
  }
  return found.sort();
}

const lcovFiles = findLcovFiles();
if (lcovFiles.length === 0) {
  process.stderr.write(
    '[test-coverage] no packages/**/coverage/lcov.info found.\n'
    + '                Every package needs a real `test` script and the lcov\n'
    + '                reporter — see docs/package-coverage-and-sonar-lcov.md\n',
  );
  process.exit(1);
}

// ── 3. rewrite SF: paths, 4. merge ─────────────────────────────────────────
let records = 0;
const chunks = [];
for (const file of lcovFiles) {
  const pkgDir = resolve(file, '..', '..');
  const text = readFileSync(file, 'utf8');
  const rewritten = text.replace(/^SF:(.*)$/gm, (_m, raw) => {
    const src = raw.trim();
    // vitest writes absolute paths; anything relative is relative to the package.
    const abs = src.startsWith(sep) || /^[A-Za-z]:[\\/]/.test(src) ? src : join(pkgDir, src);
    records += 1;
    return `SF:${relative(REPO_ROOT, abs).split(sep).join('/')}`;
  });
  chunks.push(rewritten.endsWith('\n') ? rewritten : `${rewritten}\n`);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, chunks.join(''), 'utf8');

log(`merged ${lcovFiles.length} package LCOV file(s), ${records} source record(s)`);
log(`wrote ${relative(REPO_ROOT, OUT_FILE)} — Sonar input`);

if (testsFailed) {
  process.stderr.write('[test-coverage] tests failed; coverage was still written\n');
  process.exit(1);
}
