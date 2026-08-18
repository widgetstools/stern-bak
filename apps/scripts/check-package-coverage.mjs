#!/usr/bin/env node
/**
 * check-package-coverage.mjs — verify every app FILE meets the 70% threshold.
 *
 * Per file, not per app: an app-wide average lets a well-covered module pay
 * for an untested one, which is exactly the shape the packages tree rejected
 * (see `scripts/vitestCoverage.mjs`). `apps/scripts/vitestCoverage.mjs` sets
 * the same `perFile` thresholds on the Vitest run itself, so a breach fails
 * the test run too; this script is the report that names every file at once
 * instead of stopping at the first.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const THRESHOLD = 70;
const METRICS = ['lines', 'statements', 'functions', 'branches'];
const tracks = ['source', 'tarball'];

/** Files below the threshold on any metric, with the metrics that failed. */
function checkSummary(summaryPath, appDir) {
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const failures = [];
  for (const [file, entry] of Object.entries(summary)) {
    if (file === 'total') continue;
    const under = METRICS.filter((m) => (entry[m]?.pct ?? 0) < THRESHOLD)
      .map((m) => `${m}=${entry[m]?.pct ?? 0}%`);
    if (under.length > 0) failures.push(`${relative(appDir, file)}: ${under.join(', ')}`);
  }
  return failures;
}

let failed = 0;

for (const track of tracks) {
  const trackRoot = join(REPO_ROOT, track);
  if (!existsSync(trackRoot)) continue;
  for (const entry of readdirSync(trackRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const appDir = join(trackRoot, entry.name);
    const summaryPath = join(appDir, 'coverage', 'coverage-summary.json');
    if (!existsSync(summaryPath)) continue;
    const failures = checkSummary(summaryPath, appDir);
    const label = `${track}/${entry.name}`;
    if (failures.length > 0) {
      failed++;
      process.stderr.write(`✗ ${label}: ${failures.length} file(s) below ${THRESHOLD}%\n`);
      for (const line of failures) process.stderr.write(`    ${line}\n`);
    } else {
      process.stdout.write(`✓ ${label}\n`);
    }
  }
}

if (failed > 0) process.exit(1);
