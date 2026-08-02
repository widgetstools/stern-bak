#!/usr/bin/env node
/**
 * check-package-coverage.mjs — verify each app meets the 70% coverage threshold.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const THRESHOLD = 70;
const tracks = ['source', 'tarball'];

function checkSummary(summaryPath) {
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const total = summary.total;
  const metrics = ['lines', 'statements', 'functions', 'branches'];
  const failures = [];
  for (const metric of metrics) {
    const pct = total[metric]?.pct ?? 0;
    if (pct < THRESHOLD) failures.push(`${metric}=${pct}%`);
  }
  return failures;
}

let failed = 0;

for (const track of tracks) {
  const trackRoot = join(REPO_ROOT, track);
  if (!existsSync(trackRoot)) continue;
  for (const entry of readdirSync(trackRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const summaryPath = join(trackRoot, entry.name, 'coverage', 'coverage-summary.json');
    if (!existsSync(summaryPath)) continue;
    const failures = checkSummary(summaryPath);
    const label = `${track}/${entry.name}`;
    if (failures.length > 0) {
      failed++;
      process.stderr.write(`✗ ${label}: ${failures.join(', ')}\n`);
    } else {
      process.stdout.write(`✓ ${label}\n`);
    }
  }
}

if (failed > 0) process.exit(1);
