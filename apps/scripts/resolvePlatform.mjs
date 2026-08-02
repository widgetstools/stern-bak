/**
 * resolvePlatform.mjs — the ONLY place that knows where the platform checkout is.
 *
 * The apps repo consumes `@wellsfargo-starui/platform` (the library monorepo) but
 * must not hardcode its directory name. npm cannot interpolate variables into
 * `file:` specifiers, so the path is resolved here instead and materialised by
 * `setup.mjs` (vendored tarballs) and `linkPlatform.mjs` (node_modules symlink).
 *
 * Resolution order:
 *   1. $STARUI_PLATFORM              — explicit, wins outright
 *   2. parent directory              — the in-repo layout (<platform>/apps)
 *   3. ../<sibling>                  — the legacy split-repo layout
 *   4. scan sibling directories      — survives a renamed split checkout
 *
 * A candidate only counts if its package.json actually declares
 * `name: "@wellsfargo-starui/platform"`, so a stale or unrelated directory can
 * never be picked up silently.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PLATFORM_PKG_NAME = '@wellsfargo-starui/platform';

/** Default sibling name — a starting guess, not a requirement. */
const DEFAULT_SIBLING = 'stern-bak';

/**
 * True when `dir` is a checkout of the platform monorepo.
 *
 * Never throws: it is called against arbitrary sibling directories, some of
 * which may be unreadable (Windows permissions) or hold malformed JSON.
 */
export function isPlatformCheckout(dir) {
  const pkgPath = join(dir, 'package.json');
  try {
    if (!existsSync(pkgPath)) return false;
    return JSON.parse(readFileSync(pkgPath, 'utf8')).name === PLATFORM_PKG_NAME;
  } catch {
    return false;
  }
}

function scanSiblings() {
  const parent = dirname(REPO_ROOT);
  // At a filesystem/drive root `dirname` returns its input — nothing to scan.
  if (parent === REPO_ROOT) return null;

  const self = basename(REPO_ROOT);
  const sameName = (a, b) =>
    process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

  let entries;
  try {
    entries = readdirSync(parent, { withFileTypes: true });
  } catch {
    // Unreadable parent (permissions, or a UNC path we cannot enumerate).
    return null;
  }

  const candidates = entries
    // `isDirectory()` is false for a symlinked directory; a checkout reached
    // through a symlink is still a valid platform repo, so allow both.
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .filter((e) => !sameName(e.name, self))
    .map((e) => e.name)
    .sort();

  for (const name of candidates) {
    const candidate = join(parent, name);
    if (isPlatformCheckout(candidate)) return candidate;
  }
  return null;
}

/**
 * Absolute path to the platform checkout.
 * @param {{optional?: boolean}} opts `optional: true` returns null instead of throwing.
 */
export function resolvePlatform(opts = {}) {
  // `set STARUI_PLATFORM="C:\repos\starui\"` on Windows arrives with the quotes
  // attached, and a trailing separator confuses nothing but reads badly in logs.
  const raw = (process.env.STARUI_PLATFORM ?? '').trim().replace(/^["']|["']$/g, '');
  if (raw) {
    const abs = resolve(raw);
    if (isPlatformCheckout(abs)) return abs;
    throw new Error(
      `STARUI_PLATFORM is set to "${raw}" but that is not a ${PLATFORM_PKG_NAME} `
        + `checkout (no package.json with that name). Point it at the platform repo root.`,
    );
  }

  // In-repo layout: this directory lives at `<platform>/apps`, so the
  // platform checkout is simply the parent. Checked before the sibling
  // paths so a leftover split-repo checkout beside the monorepo can
  // never shadow the repo this apps/ tree is actually part of.
  const parent = dirname(REPO_ROOT);
  if (parent !== REPO_ROOT && isPlatformCheckout(parent)) return parent;

  const sibling = resolve(REPO_ROOT, '..', DEFAULT_SIBLING);
  if (isPlatformCheckout(sibling)) return sibling;

  const scanned = scanSiblings();
  if (scanned) return scanned;

  if (opts.optional) return null;

  const example =
    process.platform === 'win32'
      ? '  set STARUI_PLATFORM=C:\\path\\to\\platform && npm install'
      : '  STARUI_PLATFORM=/path/to/platform npm install';

  throw new Error(
    `Could not locate the ${PLATFORM_PKG_NAME} checkout.\n`
      + `Tried, in order:\n`
      + `  1. STARUI_PLATFORM               (not set)\n`
      + `  2. ${dirname(REPO_ROOT)}         (parent — in-repo layout)\n`
      + `  3. ${sibling}\n`
      + `  4. every sibling directory of ${REPO_ROOT}\n\n`
      + `Clone the platform repo beside this one, or point STARUI_PLATFORM at it:\n`
      + `${example}\n`,
  );
}

export { REPO_ROOT, PLATFORM_PKG_NAME };
