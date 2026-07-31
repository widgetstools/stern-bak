#!/usr/bin/env node
/**
 * setup.mjs — vendor the platform's packed member tarballs for the tarball track.
 *
 * Run via `npm run setup:tarball`, which vendors and then installs.
 *
 * It is NOT an install lifecycle hook: npm resolves the dependency tree before
 * running any root script, so a `preinstall` that produced these files would
 * still be too late (verified — a workspace `file:` dep pointing at
 * not-yet-vendored tarballs fails with ENOENT during tree building). That is
 * also why `tarball/*` is not a workspace.
 *
 * Two couplings are removed by copying rather than pointing:
 *
 *   1. the platform DIRECTORY NAME — only resolvePlatform.mjs knows it
 *   2. the package VERSION — pack:npm emits versioned filenames
 *      (wellsfargo-starui-grid-0.1.0.tgz), so a pin straight at dist-npm/ breaks
 *      on the first version bump. The version is stripped here:
 *
 *        <platform>/dist-npm/wellsfargo-starui-grid-0.1.0.tgz
 *          -> vendor/wellsfargo-starui-grid.tgz
 *
 * Consequence worth knowing: because the vendored filename is stable, npm cannot
 * tell that a tarball's CONTENTS changed. Any package whose vendored bytes differ
 * is therefore evicted from node_modules below, so the next install re-extracts it.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { resolvePlatform, REPO_ROOT } from './resolvePlatform.mjs';

const TARBALL_ROOT = join(REPO_ROOT, 'tarball');
const VENDOR_DIR = join(REPO_ROOT, 'vendor');

/**
 * Every `node_modules/@wellsfargo-starui` that could hold an extracted copy.
 *
 * tarball/* is NOT a workspace, so each app installs into its OWN node_modules
 * rather than the hoisted root one — both have to be checked, or a re-vendored
 * package silently keeps serving the previous version.
 */
function installScopes() {
  const scopes = [join(REPO_ROOT, 'node_modules', '@wellsfargo-starui')];
  if (!existsSync(TARBALL_ROOT)) return scopes;
  for (const entry of readdirSync(TARBALL_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    scopes.push(join(TARBALL_ROOT, entry.name, 'node_modules', '@wellsfargo-starui'));
  }
  return scopes;
}

/** `wellsfargo-starui-grid-0.1.0.tgz` -> `wellsfargo-starui-grid.tgz` */
function stripVersion(filename) {
  return filename.replace(/-\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?\.tgz$/, '.tgz');
}

/**
 * `wellsfargo-starui-grid-0.1.0.tgz` -> `@wellsfargo-starui/grid`
 *
 * The `/` here is an npm package-name separator, not a path separator — it is
 * `/` on every platform, so `path.join` must NOT be used.
 */
function packageNameOf(filename) {
  const short = stripVersion(filename).replace(/^wellsfargo-starui-/, '').replace(/\.tgz$/, '');
  return `@wellsfargo-starui/${short}`;
}

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function log(msg) {
  process.stdout.write(`[setup] ${msg}\n`);
}

const platform = resolvePlatform();
const distNpm = join(platform, 'dist-npm');

if (!existsSync(distNpm)) {
  process.stderr.write(
    `[setup] ${distNpm} does not exist.\n`
      + `        The tarball track installs the platform's packed member packages.\n`
      + `        Run this in the platform repo first:\n\n`
      + `          npm install && npm run build:packages && npm run pack:npm\n\n`,
  );
  process.exit(1);
}

const allTarballs = readdirSync(distNpm).filter((f) => f.endsWith('.tgz'));
if (allTarballs.length === 0) {
  process.stderr.write(`[setup] ${distNpm} contains no .tgz — run \`npm run pack:npm\` in the platform repo.\n`);
  process.exit(1);
}

/*
 * `pack:npm` does not clean dist-npm/, so after a version bump BOTH
 * wellsfargo-starui-grid-0.1.0.tgz and wellsfargo-starui-grid-0.9.9.tgz sit
 * there. They strip to the same vendored filename, so pick the most recently
 * written one per package — otherwise the winner depends on readdir order.
 */
const newestPerPackage = new Map();
for (const file of allTarballs) {
  const key = stripVersion(file);
  const mtime = statSync(join(distNpm, file)).mtimeMs;
  const prev = newestPerPackage.get(key);
  if (!prev || mtime > prev.mtime) newestPerPackage.set(key, { file, mtime });
}

const tarballs = [...newestPerPackage.values()].map((e) => e.file);
const superseded = allTarballs.length - tarballs.length;
if (superseded > 0) {
  log(`ignoring ${superseded} superseded tarball(s) in dist-npm/ (older versions of the same package)`);
}

mkdirSync(VENDOR_DIR, { recursive: true });

// Drop vendored tarballs that no longer correspond to a packed package.
const expected = new Set(tarballs.map(stripVersion));
for (const stale of readdirSync(VENDOR_DIR).filter((f) => f.endsWith('.tgz'))) {
  if (expected.has(stale)) continue;
  rmSync(join(VENDOR_DIR, stale));
  log(`removed stale ${stale}`);
}

let copied = 0;
const changed = [];
for (const src of tarballs) {
  const destName = stripVersion(src);
  const srcPath = join(distNpm, src);
  const destPath = join(VENDOR_DIR, destName);

  if (existsSync(destPath) && statSync(destPath).size === statSync(srcPath).size
      && sha(destPath) === sha(srcPath)) {
    continue;
  }
  copyFileSync(srcPath, destPath);
  copied += 1;
  changed.push(packageNameOf(src));
}

// Stable filenames hide content changes from npm. Evict the installed copies of
// anything whose bytes moved so the install that follows re-extracts them.
let evicted = 0;
for (const scope of installScopes()) {
  for (const pkg of changed) {
    const short = pkg.split('/').pop();
    const installed = join(scope, short);
    if (!existsSync(installed)) continue;
    // maxRetries covers Windows EBUSY/EPERM when a watcher or editor still
    // holds a handle on a file inside the package directory.
    rmSync(installed, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    evicted += 1;
  }
}

/*
 * Evicting node_modules is not enough. The lockfile records an `integrity` hash
 * per resolved tarball, and the `file:` specifier did not change — so npm
 * matches the old hash, pulls the previous bytes from its content-addressed
 * cache, and reinstalls the SAME version. (Verified: grid stayed at 0.1.0 after
 * a bump to 0.9.9 until the lock was removed.)
 *
 * Lockfiles are gitignored here by repo policy, so dropping them is free.
 */
let locksDropped = 0;
if (changed.length > 0 && existsSync(TARBALL_ROOT)) {
  for (const entry of readdirSync(TARBALL_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const lock = join(TARBALL_ROOT, entry.name, 'package-lock.json');
    if (!existsSync(lock)) continue;
    rmSync(lock, { force: true, maxRetries: 5, retryDelay: 100 });
    locksDropped += 1;
  }
}

log(`platform: ${platform}`);
log(
  `vendored ${tarballs.length} tarball(s) -> vendor/ `
    + `(${copied} updated, ${tarballs.length - copied} unchanged`
    + `${evicted > 0 ? `, ${evicted} evicted from node_modules` : ''}`
    + `${locksDropped > 0 ? `, ${locksDropped} stale lockfile(s) dropped` : ''})`,
);
