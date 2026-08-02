#!/usr/bin/env node
/**
 * linkPlatform.mjs — materialise `node_modules/@wellsfargo-starui/platform`.
 *
 * Runs as `postinstall`. The source track reaches the platform repo through this
 * one symlink:
 *
 *   vite.config.ts  import '@wellsfargo-starui/platform/scripts/staruiConsumerVite.mjs'
 *   tsconfig.json   "extends": "@wellsfargo-starui/platform/tsconfig.consumer.json"
 *
 * It used to be produced by a `"@wellsfargo-starui/platform": "file:../stern-bak"`
 * dependency, which baked the directory name into package.json. Creating the link
 * ourselves from a resolved path removes that, at the cost of the link being
 * extraneous to npm's dependency tree — npm prunes it on each install, and this
 * script (running at the end of that same install) puts it back.
 *
 * Windows notes:
 *   - A *junction* is used rather than a symlink: junctions need no elevated
 *     privileges or Developer Mode, which plain directory symlinks do.
 *   - `fs.symlink(target, path, 'junction')` requires an ABSOLUTE target. A
 *     relative one silently produces a broken link, so the target is only made
 *     relative on POSIX (where it keeps the checkout pair movable).
 *   - Comparison of an existing link goes through `realpathSync` instead of
 *     string-matching `readlink`, because a junction reads back as an absolute
 *     path — often with a trailing separator and different casing.
 */
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { resolvePlatform, REPO_ROOT } from './resolvePlatform.mjs';

const IS_WINDOWS = process.platform === 'win32';
const LINK_PATH = join(REPO_ROOT, 'node_modules', '@wellsfargo-starui', 'platform');

function log(msg) {
  process.stdout.write(`[link-platform] ${msg}\n`);
}

function lstatSafe(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

/** realpath, or null when the path is missing or a dangling link. */
function realpathSafe(path) {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/** Same directory? Compares real paths, case-insensitively on Windows. */
function samePath(a, b) {
  if (!a || !b) return false;
  return IS_WINDOWS ? a.toLowerCase() === b.toLowerCase() : a === b;
}

const platform = resolvePlatform();
const platformReal = realpathSafe(platform) ?? platform;

mkdirSync(dirname(LINK_PATH), { recursive: true });

const existing = lstatSafe(LINK_PATH);
if (existing) {
  if (samePath(realpathSafe(LINK_PATH), platformReal)) {
    log(`ok -> ${platform}`);
    process.exit(0);
  }
  // Wrong target, or DANGLING because the checkout was renamed or moved.
  //
  // A dangling symlink must be unlinked, not rm'd: `rmSync(..., {force: true})`
  // resolves the link, gets ENOENT from the missing target, and `force`
  // swallows that error without ever removing the link itself — leaving the
  // symlink() below to fail with EEXIST.
  if (existing.isSymbolicLink()) {
    unlinkSync(LINK_PATH);
  } else {
    rmSync(LINK_PATH, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

// Junctions require an absolute target; POSIX symlinks stay relative so the
// pair of checkouts can be relocated together.
const target = IS_WINDOWS ? platformReal : relative(dirname(LINK_PATH), platform);
symlinkSync(target, LINK_PATH, IS_WINDOWS ? 'junction' : 'dir');

if (!existsSync(LINK_PATH)) {
  process.stderr.write(
    `[link-platform] created a link at ${LINK_PATH} but it does not resolve.\n`
      + `                Target was: ${target}\n`,
  );
  process.exit(1);
}

log(`linked @wellsfargo-starui/platform -> ${platform}`);
