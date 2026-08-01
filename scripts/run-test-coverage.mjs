#!/usr/bin/env node
/**
 * run-test-coverage.mjs — package coverage for Sonar.
 *
 * Sonar reads exactly one file, `coverage/lcov.info` at the repo root (see
 * sonar-project.properties). Vitest writes one LCOV per package, so this:
 *
 *   1. runs `npx turbo test` across every package, passing the coverage
 *      reporters through to each package's vitest;
 *   2. scans `packages/<bucket>/coverage/lcov.info` (collapsed buckets write
 *      coverage at the bucket root) plus `packages/<bucket>/<pkg>/coverage/`
 *      for stragglers that still own their own manifest;
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
//
// --concurrency=1 is equally essential, and less obvious. At turbo's default
// (10 tasks here) every task starts its own vitest worker pool, the machine is
// oversubscribed, and packages start dropping tests or failing to write a
// coverage-summary.json at all. Four consecutive runs on an UNCHANGED tree once
// reported 504, 515, 520 and 391 files above the bar; openfin-platform reported
// 23, then 16, then 5, then no summary at all, while scoring 86.8% and fully
// clear when run on its own. Coverage is a measurement, so reproducibility beats
// speed — a number nobody can reproduce is worse than a slow one.
//
// Pass an explicit --concurrency to override (and accept that the result is not
// comparable to a serial run).
const hasConcurrency = passthrough.some((a) => a.startsWith('--concurrency'));
const concurrency = hasConcurrency ? '' : '--concurrency=1';

const turboCmd = `npx turbo test --continue ${concurrency} ${passthrough.join(' ')} -- ${vitestArgs}`
  .replace(/\s+/g, ' ');

if (hasConcurrency) {
  log('WARNING: explicit --concurrency given; the result may not be reproducible');
}
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
    // Collapsed buckets run one vitest per bucket and write coverage at the
    // bucket root.
    const bucketLcov = join(bucketDir, 'coverage', 'lcov.info');
    if (existsSync(bucketLcov)) found.push(bucketLcov);
    // Two-level scan stays for stragglers — member dirs that still own a
    // @wellsfargo-starui/* manifest (host-data-angular). A collapsed member's
    // own coverage/ (if present) is a stale pre-collapse artifact that would
    // double-report the same sources with older data, so dirs without a
    // scoped manifest — including the core-engine build shim, which every
    // script ignores — are skipped.
    for (const pkg of readdirSync(bucketDir, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const pkgDir = join(bucketDir, pkg.name);
      const manifestPath = join(pkgDir, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const name = JSON.parse(readFileSync(manifestPath, 'utf8')).name ?? '';
      if (!name.startsWith('@wellsfargo-starui/')) continue;
      const lcov = join(pkgDir, 'coverage', 'lcov.info');
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
