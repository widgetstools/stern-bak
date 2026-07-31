#!/usr/bin/env node
/**
 * Fresh install for the nested apps/ workspace.
 *
 * apps/package-lock.json is gitignored. If a stale lockfile is left on disk,
 * npm install fails with EINTEGRITY when libs/*.tgz content no longer matches
 * recorded sha512 hashes — even after a successful propagate.
 */
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';

const APPS_ROOT = join(import.meta.dirname, '..', 'apps');
const STALE_LOCKFILES = [
  join(APPS_ROOT, 'package-lock.json'),
  // Written when npm install runs with `@wellsfargo-starui/platform: file:..` hoisted into the
  // apps workspace — embeds the repo-root workspace graph and makes file:libs/*.tgz
  // deps resolve against registry.npmjs.org instead of local tarballs (ETARGET).
  join(APPS_ROOT, 'node_modules', '.package-lock.json'),
];

for (const lockfile of STALE_LOCKFILES) {
  if (!existsSync(lockfile)) continue;
  unlinkSync(lockfile);
  process.stdout.write(`[install:apps] removed stale ${relative(join(import.meta.dirname, '..'), lockfile).replace(/\\/g, '/')}\n`);
}

execSync('npm install --no-audit --no-fund', { cwd: APPS_ROOT, stdio: 'inherit' });
