#!/usr/bin/env node
/**
 * check-package-coverage.mjs — enforce the per-file coverage bar across apps.
 *
 * This used to read only `summary.total` — an APP-level average. That is the
 * exact hiding place the packages gate was built to close: `markets-grid-lab`
 * averaged well past 70% while `SsrmDemoRail.tsx` sat at 31% and
 * `SsrmProfilesTab.tsx` at 0%, and the run stayed green. So the two roots now
 * apply one policy, imported from the platform rather than restated here:
 *
 *   1. An app with a `test` script produced no coverage summary.
 *   2. A source file the policy says to score is absent from the summary.
 *      `spg-pricing-blotter` had no `coverage` block at all, so v8 scored only
 *      what a test happened to import — six source files were not 0%, they
 *      were not there. Absence is the failure the threshold cannot catch.
 *   3. A reported file is below the threshold (default 70%) on lines,
 *      statements, functions or branches.
 *
 * Reads the `coverage/coverage-summary.json` each app writes, so run
 * `npm run test:coverage` first.
 *
 * Usage:
 *   node scripts/check-package-coverage.mjs            # gate, exits non-zero
 *   node scripts/check-package-coverage.mjs --report   # list only, always exits 0
 *   node scripts/check-package-coverage.mjs --threshold 80
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { policyFor } from '@wellsfargo-starui/platform/scripts/vitestCoverage.mjs';
import { unreportedFiles } from '@wellsfargo-starui/platform/scripts/coverageInclusion.mjs';

const APPS_ROOT = resolve(import.meta.dirname, '..');
/**
 * Only the `source` track. `tarball/<app>` is not a second app — it is a
 * verbatim copy of `source/<app>/src` that `makeTarballApp.mjs` regenerates
 * (it is untracked; `git ls-files apps/tarball` is empty). Gating it would
 * score the same files twice and put generated output on the critical path,
 * while a real gap would still show up on the source side. The tarball track
 * exists to prove the external install RESOLVES, which is what
 * `npm run test:tarball` checks.
 */
const TRACKS = ['source'];
const METRIC_KEYS = ['lines', 'statements', 'functions', 'branches'];

const argv = process.argv.slice(2);
const reportOnly = argv.includes('--report');
const thresholdArg = argv.indexOf('--threshold');
const THRESHOLD = thresholdArg !== -1 ? Number(argv[thresholdArg + 1]) : 70;

/** A `test` script that does not actually run a suite. */
function isPlaceholderTest(script) {
  if (!script) return true;
  return /^\s*(echo|true|exit\s+0|:)\b/.test(script);
}

/** Apps across both tracks: a directory with a package.json under `<track>/`. */
function discoverApps() {
  const out = [];
  for (const track of TRACKS) {
    const trackRoot = join(APPS_ROOT, track);
    if (!existsSync(trackRoot)) continue;
    for (const entry of readdirSync(trackRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      const dir = join(trackRoot, entry.name);
      const pkgPath = join(dir, 'package.json');
      // A leftover build/coverage directory from a deleted app has no manifest.
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      out.push({ label: `${track}/${entry.name}`, dir, testScript: pkg.scripts?.test });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

const apps = discoverApps();
const noSummary = [];
const filesNotCollected = []; // { app, files }
const belowByApp = new Map();
let totalFiles = 0;
let totalBelow = 0;

for (const app of apps) {
  if (isPlaceholderTest(app.testScript)) continue;

  const summaryPath = join(app.dir, 'coverage', 'coverage-summary.json');
  if (!existsSync(summaryPath)) {
    noSummary.push(app);
    continue;
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

  const policy = policyFor(`apps/${app.label}`);
  const missing = unreportedFiles(app.dir, summary, policy);
  if (missing.length > 0) filesNotCollected.push({ app, files: missing });

  const below = [];
  for (const [file, metrics] of Object.entries(summary)) {
    if (file === 'total') continue;
    totalFiles += 1;
    const failing = [];
    let minPct = 100;
    for (const key of METRIC_KEYS) {
      const pct = metrics[key]?.pct ?? 0;
      minPct = Math.min(minPct, pct);
      if (pct < THRESHOLD) failing.push({ name: key, pct });
    }
    if (failing.length > 0) {
      below.push({ file: relative(APPS_ROOT, file), minPct, failing });
      totalBelow += 1;
    }
  }
  if (below.length > 0) {
    below.sort((a, b) => a.minPct - b.minPct);
    belowByApp.set(app.label, below);
  }
}

// ── report ─────────────────────────────────────────────────────────────────
const w = (s) => process.stdout.write(s);

if (noSummary.length > 0) {
  w(`\n✗ ${noSummary.length} app(s) have a test script but produced NO coverage summary:\n`);
  for (const a of noSummary) w(`    ${a.label}\n`);
  w('\n  A missing summary is a COLLECTION failure, not a coverage result — the\n');
  w('  app simply drops out of the denominator below. Re-run `npm run test:coverage`.\n');
}

if (filesNotCollected.length > 0) {
  const n = filesNotCollected.reduce((a, u) => a + u.files.length, 0);
  w(`\n✗ ${n} source file(s) on disk that no coverage report contains:\n`);
  for (const { app, files } of filesNotCollected) {
    w(`\n  ${app.label}  (${files.length})\n`);
    for (const f of files.slice(0, 20)) w(`    ${app.label}/${f}\n`);
    if (files.length > 20) w(`    … and ${files.length - 20} more\n`);
  }
  w('  These are NOT 0% files — they are missing rows, so the per-file threshold\n');
  w('  never sees them. Either the app\'s include globs do not reach them, or they\n');
  w('  belong in EXCLUDE (scripts/vitestCoverage.mjs) with a why-comment.\n');
}

if (belowByApp.size > 0) {
  w(`\n✗ ${totalBelow} file(s) below ${THRESHOLD}% on any metric:\n`);
  for (const [label, files] of [...belowByApp].sort((a, b) => b[1].length - a[1].length)) {
    w(`\n  ${label}  (${files.length})\n`);
    for (const f of files.slice(0, 15)) {
      const metrics = f.failing.map((m) => `${m.name}:${m.pct.toFixed(1)}%`).join(', ');
      w(`    ${metrics.padEnd(40)}  ${f.file}\n`);
    }
    if (files.length > 15) w(`    … and ${files.length - 15} more\n`);
  }
}

w(`\n${'─'.repeat(64)}\n`);
if (noSummary.length > 0) {
  w(`INVALID — ${noSummary.length} of ${apps.length} app(s) produced no summary; `);
  w('do not quote a percentage from this run.\n');
} else {
  const covered = totalFiles - totalBelow;
  w(`Files at or above ${THRESHOLD}%: ${covered}/${totalFiles}`);
  if (totalFiles > 0) w(`  (${((covered / totalFiles) * 100).toFixed(1)}%)`);
  w(`\nMeasured across ${apps.length} app(s).\n`);
}

const failed = totalBelow > 0 || noSummary.length > 0 || filesNotCollected.length > 0;
if (failed && !reportOnly) {
  w('\nFAILED — see docs/APPS_REPO.md\n');
  process.exit(1);
}
if (!failed) w('\nPASS\n');
