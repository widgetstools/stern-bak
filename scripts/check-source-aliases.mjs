#!/usr/bin/env node
/**
 * check-source-aliases.mjs — verify @wellsfargo-starui/* paths resolve in source mode
 * before running demo apps (without relying on dist/ being present).
 *
 *   npm run check:source-aliases
 *   npm run check:source-aliases -- --strict   # also fail when dist/ is missing
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { auditSourceModePaths } from './staruiConsumerAliases.mjs';

const REPO_ROOT = join(import.meta.dirname, '..');
const APPS_DEMO = join(REPO_ROOT, 'apps', 'demos');
const strict = process.argv.includes('--strict');

function log(msg) {
  process.stdout.write(`[check:source-aliases] ${msg}\n`);
}

function die(msg) {
  process.stderr.write(`[check:source-aliases] ERROR: ${msg}\n`);
  process.exit(1);
}

/** Collect @wellsfargo-starui/* specifiers used in demo app source (imports + CSS @import). */
function collectAppStaruiImports() {
  const specs = new Set();
  const re = /(?:from\s+|import\s+|@import\s+)['"](@wellsfargo-starui\/[^'"]+)['"]/g;

  function walk(dir) {
    if (dir.split(/[\\/]/).includes('node_modules')) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(tsx?|jsx?|css|mjs)$/.test(entry.name)) continue;
      const text = readFileSync(p, 'utf8');
      for (const m of text.matchAll(re)) specs.add(m[1]);
    }
  }

  if (existsSync(APPS_DEMO)) walk(APPS_DEMO);
  return [...specs].sort();
}

const appDir = resolve(APPS_DEMO, 'demo-react');
const pretendNoDist = process.argv.includes('--pretend-no-dist');
const { broken, requiresBuild, ok } = auditSourceModePaths(appDir, { ignoreDist: pretendNoDist });

log(`source-mode exports OK: ${ok.length}`);

if (requiresBuild.length > 0) {
  log(`need npm run build:packages (${requiresBuild.length} generated path(s)):`);
  for (const item of requiresBuild) {
    log(`  - ${item.label}  (${item.relTarget})`);
  }
}

if (broken.length > 0) {
  log(`missing src fallback (${broken.length}):`);
  for (const item of broken) {
    log(`  - ${item.label}  → ${item.path}`);
  }
}

const appImports = collectAppStaruiImports();
const buildImportHits = appImports.filter((spec) => {
  if (requiresBuild.some((i) => spec === i.label || spec.startsWith(`${i.label}/`))) return true;
  if (spec.includes('/assets/') && spec.endsWith('.mjs')) return true;
  if (spec.endsWith('/css')) return true;
  return false;
});

if (buildImportHits.length > 0 && requiresBuild.length > 0) {
  log(`demo apps import ${buildImportHits.length} path(s) that require build:packages (e.g. ${buildImportHits.slice(0, 3).join(', ')})`);
}

if (broken.length > 0) {
  die(
    `${broken.length} @wellsfargo-starui export(s) have no source-mode fallback. `
    + 'Fix scripts/staruiConsumerAliases.mjs or package exports.',
  );
}

if (strict && requiresBuild.length > 0) {
  die('Run `npm run build:packages` before starting demo apps (--strict).');
}

if (requiresBuild.length > 0) {
  log('OK with caveat — run `npm run build:packages` once before `npm run dev` (CSS, worker, …).');
} else {
  log('done — all @wellsfargo-starui exports resolve in source mode without a prior package build.');
}
