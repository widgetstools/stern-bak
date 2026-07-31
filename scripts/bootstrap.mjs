#!/usr/bin/env node
/**
 * bootstrap.mjs — full monorepo install + pack libs/*.tgz (gitignored).
 *
 *   1. npm install          — packages/* at repo root (generates a local lock)
 *   2. build:packages + propagate — writes libs/*.tgz (local only, for the
 *      external/Artifactory tarball consumers; apps do NOT depend on them)
 *   3. npm install --prefix apps — consumer apps, resolved from packages/ source
 *
 * Lockfiles are intentionally NOT committed (see .gitignore): they pin a
 * registry host a corporate-Artifactory client cannot reach. Every install
 * uses `npm install`, so a fresh clone regenerates its own lock against
 * whatever registry its .npmrc points at. Whether libs/ already exists is
 * judged from libs/manifest.json (written by propagate), not from a lock.
 *
 * Usage:
 *   npm run bootstrap
 *   npm run bootstrap -- --force        # rebuild libs/ even when tarballs exist
 *   npm run bootstrap -- --no-install   # pack only, skip npm install steps
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const LIBS_DIR = join(REPO_ROOT, 'libs');
const MANIFEST_PATH = join(LIBS_DIR, 'manifest.json');

const force = process.argv.includes('--force');
const noCi = process.argv.includes('--no-install') || process.argv.includes('--no-ci');

function log(msg) {
  process.stdout.write(`[bootstrap] ${msg}\n`);
}

function run(cmd) {
  log(`> ${cmd}`);
  execSync(cmd, { cwd: REPO_ROOT, stdio: 'inherit' });
}

function requiredTarballs() {
  // Derived from libs/manifest.json (written by propagate). On a fresh clone
  // the manifest is absent → return null so bootstrap packs from packages/.
  if (!existsSync(MANIFEST_PATH)) return null;
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const files = Object.values(manifest)
      .map((entry) => entry?.filename)
      .filter((f) => typeof f === 'string');
    return files.length > 0 ? [...new Set(files)].sort() : null;
  } catch {
    return null;
  }
}

function libsReady() {
  const required = requiredTarballs();
  if (!required) {
    log('libs/manifest.json missing — will run propagate');
    return false;
  }
  const missing = required.filter((f) => !existsSync(join(LIBS_DIR, f)));
  if (missing.length === 0) {
    log(`libs/ OK (${required.length} bucket tarball(s))`);
    return true;
  }
  log(`libs/ missing ${missing.length}/${required.length} tarball(s) — will run propagate`);
  for (const f of missing.slice(0, 8)) log(`  - ${f}`);
  return false;
}

function main() {
  const needsPack = force || !libsReady();

  if (!noCi) {
    run('npm install');
  }

  if (needsPack) {
    log('packing libs/ from packages/ (not committed to git)');
    run('npm run build:packages');
    run('node scripts/propagate.mjs --skip-drift-check');
  }

  if (!noCi) {
    run('npm run install:apps');
  }

  log('done');
}

main();
