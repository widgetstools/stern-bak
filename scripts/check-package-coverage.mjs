#!/usr/bin/env node
/**
 * check-package-coverage.mjs — enforce the per-file coverage bar.
 *
 * Two failure modes, both treated as coverage failures:
 *
 *   1. A package has no real `test` script. A missing script — or a placeholder
 *      like `"test": "echo no tests yet"` — silently contributes nothing to the
 *      merged Sonar LCOV while looking green in `turbo test`. That is worse
 *      than a red package, because nobody notices.
 *   2. A source file is below the line threshold (default 70%).
 *
 * Reads the `coverage/coverage-summary.json` each package writes, so run
 * `npm run test:coverage` first.
 *
 * Usage:
 *   node scripts/check-package-coverage.mjs            # gate, exits non-zero
 *   node scripts/check-package-coverage.mjs --report   # list only, always exits 0
 *   node scripts/check-package-coverage.mjs --threshold 80
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');

const argv = process.argv.slice(2);
const reportOnly = argv.includes('--report');
const thresholdArg = argv.indexOf('--threshold');
const THRESHOLD = thresholdArg !== -1 ? Number(argv[thresholdArg + 1]) : 70;

/** Excluded from the pipeline entirely — see CLAUDE.md. */
const SKIP_PACKAGES = new Set(['@wellsfargo-starui/host-data-angular']);

/** A `test` script that does not actually run a suite. */
function isPlaceholderTest(script) {
  if (!script) return true;
  return /^\s*(echo|true|exit\s+0|:)\b/.test(script);
}

function discoverPackages() {
  const out = [];
  for (const bucket of readdirSync(PACKAGES_ROOT, { withFileTypes: true })) {
    if (!bucket.isDirectory()) continue;
    const bucketDir = join(PACKAGES_ROOT, bucket.name);
    for (const entry of readdirSync(bucketDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(bucketDir, entry.name);
      const pkgPath = join(dir, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (SKIP_PACKAGES.has(pkg.name)) continue;
      out.push({ name: pkg.name, dir, testScript: pkg.scripts?.test });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const packages = discoverPackages();
const noHarness = [];
const noSummary = [];
const belowByPackage = new Map();
let totalFiles = 0;
let totalBelow = 0;

for (const pkg of packages) {
  if (isPlaceholderTest(pkg.testScript)) {
    noHarness.push(pkg);
    continue;
  }
  const summaryPath = join(pkg.dir, 'coverage', 'coverage-summary.json');
  if (!existsSync(summaryPath)) {
    noSummary.push(pkg);
    continue;
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const below = [];
  for (const [file, metrics] of Object.entries(summary)) {
    if (file === 'total') continue;
    totalFiles += 1;
    const pct = metrics.lines?.pct ?? 0;
    if (pct < THRESHOLD) {
      below.push({ file: relative(REPO_ROOT, file), pct });
      totalBelow += 1;
    }
  }
  if (below.length > 0) {
    below.sort((a, b) => a.pct - b.pct);
    belowByPackage.set(pkg.name, below);
  }
}

// ── report ─────────────────────────────────────────────────────────────────
const w = (s) => process.stdout.write(s);

if (noHarness.length > 0) {
  w(`\n✗ ${noHarness.length} package(s) with no real \`test\` script:\n`);
  for (const p of noHarness) {
    const shown = p.testScript ? `"${p.testScript}"` : '(none)';
    w(`    ${p.name.padEnd(46)} ${shown}\n`);
  }
  w('  A package without a suite contributes nothing to the merged Sonar LCOV.\n');
}

if (noSummary.length > 0) {
  w(`\n✗ ${noSummary.length} package(s) have a test script but produced NO coverage summary:\n`);
  for (const p of noSummary) w(`    ${p.name}\n`);
  w('\n  These packages are missing from the total below, so the count is a\n');
  w('  COLLECTION failure, not a coverage result — a denominator that quietly\n');
  w('  drops from 810 to 651 reads like progress when nothing moved.\n');
  w('  Re-run `npm run test:coverage` (it pins --concurrency=1; running turbo\n');
  w('  test directly at default concurrency drops summaries under load).\n');
}

if (belowByPackage.size > 0) {
  w(`\n✗ ${totalBelow} file(s) below ${THRESHOLD}% line coverage:\n`);
  for (const [name, files] of [...belowByPackage].sort((a, b) => b[1].length - a[1].length)) {
    w(`\n  ${name}  (${files.length})\n`);
    for (const f of files.slice(0, 15)) {
      w(`    ${String(f.pct.toFixed(1)).padStart(5)}%  ${f.file}\n`);
    }
    if (files.length > 15) w(`    … and ${files.length - 15} more\n`);
  }
}

const covered = totalFiles - totalBelow;
w(`\n${'─'.repeat(64)}\n`);

if (noSummary.length > 0) {
  // Refuse to print a headline number at all. Quoting a percentage computed
  // over an incomplete package set is how a collection failure gets recorded
  // as a coverage change.
  w(`INVALID — ${noSummary.length} of ${packages.length} package(s) produced no summary.\n`);
  w(`Scored only ${totalFiles} files across ${packages.length - noSummary.length - noHarness.length} package(s); `);
  w('do not quote this number.\n');
} else {
  w(`Files at or above ${THRESHOLD}%: ${covered}/${totalFiles}`);
  if (totalFiles > 0) w(`  (${((covered / totalFiles) * 100).toFixed(1)}%)`);
  w(`\nMeasured across all ${packages.length - noHarness.length} package(s) with a suite.\n`);
}
w(`Packages without a suite: ${noHarness.length}\n`);

const failed = noHarness.length > 0 || totalBelow > 0 || noSummary.length > 0;
if (failed && !reportOnly) {
  w('\nFAILED — see docs/package-coverage-and-sonar-lcov.md\n');
  process.exit(1);
}
if (!failed) w('\nPASS\n');
