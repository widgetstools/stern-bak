#!/usr/bin/env node
/**
 * check-package-coverage.mjs — enforce the per-file coverage bar.
 *
 * Since the package collapse (WORKLOG item 11) a "coverage unit" is any
 * directory carrying a `@wellsfargo-starui/*` package.json: the seven bucket
 * roots (`packages/<bucket>/package.json`), plus a two-level fallback for
 * non-collapsed stragglers (`host-data-angular`, which stays skipped).
 * Non-scope manifests — the `core-engine-build-shim` at
 * `packages/core/engine/package.json` — are ignored everywhere, like in every
 * other script.
 *
 * Failure modes, all treated as coverage failures:
 *
 *   1. A unit has no real `test` script. A missing script — or a placeholder
 *      like `"test": "echo no tests yet"` — silently contributes nothing to the
 *      merged Sonar LCOV while looking green in `turbo test`. That is worse
 *      than a red package, because nobody notices.
 *   2. A member of a collapsed bucket (immediate subfolder with `src/`) has no
 *      `*.test.*` / `*.spec.*` file anywhere under it. This is the per-member
 *      re-expression of failure mode 1: after the collapse a suite-less member
 *      would hide inside a bucket whose siblings carry a suite.
 *   3. A member with a suite has NO file in its bucket's coverage summary.
 *      `coverage.all: true` only reports files matched by the bucket's vitest
 *      `coverage.include` globs, so a member missing from those globs silently
 *      vanishes from the per-file gate — a collection failure, like a missing
 *      summary.
 *   4. A source file is below the threshold (default 70%) on lines, statements,
 *      functions or branches.
 *
 * Reads the `coverage/coverage-summary.json` each unit writes, so run
 * `npm run test:coverage` first.
 *
 * Usage:
 *   node scripts/check-package-coverage.mjs            # gate, exits non-zero
 *   node scripts/check-package-coverage.mjs --report   # list only, always exits 0
 *   node scripts/check-package-coverage.mjs --threshold 80
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');
const SCOPE_PREFIX = '@wellsfargo-starui/';

const argv = process.argv.slice(2);
const reportOnly = argv.includes('--report');
const thresholdArg = argv.indexOf('--threshold');
const THRESHOLD = thresholdArg !== -1 ? Number(argv[thresholdArg + 1]) : 70;

const METRIC_KEYS = ['lines', 'statements', 'functions', 'branches'];

/** Excluded from the pipeline entirely. */
const SKIP_PACKAGES = new Set(['@wellsfargo-starui/host-data-angular']);

/**
 * Members allowed to carry no test suite, keyed by repo-relative member path.
 * Deliberately empty: the one candidate, generated-code
 * `packages/design-system/icons-svg`, was verified against the tree — it has
 * tests (`allIcons.test.ts`, `index.test.ts`) and keeps its source at the
 * member root with no `src/`, so it is not a member node at all. Add an entry
 * only with a why-comment explaining what makes the member untestable.
 */
const MEMBER_SUITE_EXEMPT = new Set([]);

/** A `test` script that does not actually run a suite. */
function isPlaceholderTest(script) {
  if (!script) return true;
  return /^\s*(echo|true|exit\s+0|:)\b/.test(script);
}

/** Parsed package.json, or null when the dir has none. */
function readManifest(dir) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  return JSON.parse(readFileSync(pkgPath, 'utf8'));
}

/**
 * Coverage units: bucket roots first, then a two-level fallback for members
 * that still own a `@wellsfargo-starui/*` manifest of their own. Non-scope
 * manifests (the engine build shim) are not units.
 */
function discoverUnits() {
  const out = [];
  for (const bucket of readdirSync(PACKAGES_ROOT, { withFileTypes: true })) {
    if (!bucket.isDirectory()) continue;
    const bucketDir = join(PACKAGES_ROOT, bucket.name);
    const bucketPkg = readManifest(bucketDir);
    if (bucketPkg?.name?.startsWith(SCOPE_PREFIX) && !SKIP_PACKAGES.has(bucketPkg.name)) {
      out.push({
        name: bucketPkg.name, dir: bucketDir, testScript: bucketPkg.scripts?.test, isBucket: true,
      });
    }
    for (const entry of readdirSync(bucketDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(bucketDir, entry.name);
      const pkg = readManifest(dir);
      if (!pkg?.name?.startsWith(SCOPE_PREFIX)) continue;
      if (SKIP_PACKAGES.has(pkg.name)) continue;
      out.push({ name: pkg.name, dir, testScript: pkg.scripts?.test, isBucket: false });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Members of a collapsed bucket: the union of immediate subfolders with `src/`
 * and folders the bucket's exports map names as target owners — icons-svg
 * keeps its sources at the member root with no src/, and only the exports map
 * knows it is a member. A subfolder that owns a `@wellsfargo-starui/*`
 * manifest is its own coverage unit (host-data-angular), not a member; the
 * engine shim's non-scope manifest does not disqualify `engine`.
 */
function exportTargetFolders(exportsMap, acc = new Set()) {
  for (const value of Object.values(exportsMap ?? {})) {
    if (typeof value === 'string') {
      const seg = value.replace(/^\.\//, '').split('/')[0];
      if (seg && seg !== 'dist') acc.add(seg);
    } else if (value && typeof value === 'object') {
      exportTargetFolders(value, acc);
    }
  }
  return acc;
}

function listMembers(bucketDir) {
  const out = new Set();
  for (const entry of readdirSync(bucketDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const dir = join(bucketDir, entry.name);
    if (readManifest(dir)?.name?.startsWith(SCOPE_PREFIX)) continue;
    if (existsSync(join(dir, 'src'))) out.add(entry.name);
  }
  for (const folder of exportTargetFolders(readManifest(bucketDir)?.exports)) {
    const dir = join(bucketDir, folder);
    if (!existsSync(dir) || !readdirSync(bucketDir).includes(folder)) continue;
    if (readManifest(dir)?.name?.startsWith(SCOPE_PREFIX)) continue;
    out.add(folder);
  }
  return [...out].sort();
}

/** True when any `*.test.*` / `*.spec.*` file exists under dir (skipping node_modules/dist). */
function hasSuiteFile(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      if (hasSuiteFile(join(dir, entry.name))) return true;
    } else if (/\.(test|spec)\./.test(entry.name)) {
      return true;
    }
  }
  return false;
}

/** True when at least one summary entry lives under `<unitDir>/<member>/`. */
function memberInSummary(summary, unitDir, member) {
  const prefix = join(unitDir, member) + sep;
  return Object.keys(summary).some((file) => {
    if (file === 'total') return false;
    const abs = isAbsolute(file) ? file : join(unitDir, file);
    return abs.startsWith(prefix);
  });
}

const units = discoverUnits();
const noHarness = [];
const noSummary = [];
const membersNoSuite = [];   // { unit, member }
const membersNotCollected = []; // { unit, member }
const belowByPackage = new Map();
let totalFiles = 0;
let totalBelow = 0;

for (const unit of units) {
  if (isPlaceholderTest(unit.testScript)) {
    noHarness.push(unit);
    continue;
  }

  // Per-member suite check runs regardless of whether coverage was collected —
  // a suite-less member is a gap in the tree, not in this run.
  const members = unit.isBucket ? listMembers(unit.dir) : [];
  const membersWithSuite = [];
  for (const member of members) {
    if (MEMBER_SUITE_EXEMPT.has(relative(REPO_ROOT, join(unit.dir, member)))) continue;
    if (hasSuiteFile(join(unit.dir, member))) membersWithSuite.push(member);
    else membersNoSuite.push({ unit, member });
  }

  const summaryPath = join(unit.dir, 'coverage', 'coverage-summary.json');
  if (!existsSync(summaryPath)) {
    noSummary.push(unit);
    continue;
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

  for (const member of membersWithSuite) {
    if (!memberInSummary(summary, unit.dir, member)) membersNotCollected.push({ unit, member });
  }

  const below = [];
  for (const [file, metrics] of Object.entries(summary)) {
    if (file === 'total') continue;
    totalFiles += 1;

    const failingMetrics = [];
    let minPct = 100;

    for (const key of METRIC_KEYS) {
      const pct = metrics[key]?.pct ?? 0;
      minPct = Math.min(minPct, pct);
      if (pct < THRESHOLD) {
        failingMetrics.push({ name: key, pct });
      }
    }

    if (failingMetrics.length > 0) {
      below.push({ file: relative(REPO_ROOT, file), minPct, failingMetrics });
      totalBelow += 1;
    }
  }
  if (below.length > 0) {
    below.sort((a, b) => a.minPct - b.minPct);
    belowByPackage.set(unit.name, below);
  }
}

// ── report ─────────────────────────────────────────────────────────────────
const w = (s) => process.stdout.write(s);
const memberPath = ({ unit, member }) => relative(REPO_ROOT, join(unit.dir, member));

if (noHarness.length > 0) {
  w(`\n✗ ${noHarness.length} package(s) with no real \`test\` script:\n`);
  for (const p of noHarness) {
    const shown = p.testScript ? `"${p.testScript}"` : '(none)';
    w(`    ${p.name.padEnd(46)} ${shown}\n`);
  }
  w('  A package without a suite contributes nothing to the merged Sonar LCOV.\n');
}

if (membersNoSuite.length > 0) {
  w(`\n✗ ${membersNoSuite.length} member(s) without a suite:\n`);
  for (const m of membersNoSuite) {
    w(`    ${memberPath(m).padEnd(46)} (${m.unit.name})\n`);
  }
  w('  No *.test.* / *.spec.* file anywhere under the member. Inside a collapsed\n');
  w('  bucket a suite-less member hides behind its siblings\' green run — this is\n');
  w('  the per-member form of the missing-test-script check above.\n');
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

if (membersNotCollected.length > 0) {
  w(`\n✗ ${membersNotCollected.length} member(s) absent from their bucket's coverage summary:\n`);
  for (const m of membersNotCollected) {
    w(`    ${memberPath(m).padEnd(46)} (${m.unit.name})\n`);
  }
  w('  The member has a suite, but not one of its files appears in the bucket\n');
  w('  summary — its folder is missing from the bucket vitest config\'s\n');
  w('  `coverage.include` globs, so `all: true` never scores it. A COLLECTION\n');
  w('  failure like the missing summaries above, scoped to one member.\n');
}

if (belowByPackage.size > 0) {
  w(`\n✗ ${totalBelow} file(s) below ${THRESHOLD}% on any metric:\n`);
  for (const [name, files] of [...belowByPackage].sort((a, b) => b[1].length - a[1].length)) {
    w(`\n  ${name}  (${files.length})\n`);
    for (const f of files.slice(0, 15)) {
      const metricStrs = f.failingMetrics.map((m) => `${m.name}:${m.pct.toFixed(1)}%`).join(', ');
      w(`    ${metricStrs.padEnd(40)}  ${f.file}\n`);
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
  w(`INVALID — ${noSummary.length} of ${units.length} package(s) produced no summary.\n`);
  w(`Scored only ${totalFiles} files across ${units.length - noSummary.length - noHarness.length} package(s); `);
  w('do not quote this number.\n');
} else {
  w(`Files at or above ${THRESHOLD}%: ${covered}/${totalFiles}`);
  if (totalFiles > 0) w(`  (${((covered / totalFiles) * 100).toFixed(1)}%)`);
  w(`\nMeasured across all ${units.length - noHarness.length} package(s) with a suite.\n`);
}
w(`Packages without a suite: ${noHarness.length}\n`);
w(`Members without a suite: ${membersNoSuite.length}\n`);

const failed = noHarness.length > 0 || totalBelow > 0 || noSummary.length > 0
  || membersNoSuite.length > 0 || membersNotCollected.length > 0;
if (failed && !reportOnly) {
  w('\nFAILED — see docs/package-coverage-and-sonar-lcov.md\n');
  process.exit(1);
}
if (!failed) w('\nPASS\n');
