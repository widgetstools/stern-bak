#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────
//  check-design-system-deps — workspace packages that reference
//  unified tokens (`--ds-*`) or import `@wellsfargo-starui/design-system/*`
//  must declare `@wellsfargo-starui/design-system` in dependencies,
//  peerDependencies, or devDependencies so consumers resolve one
//  coherent theme graph (npm sees the contract).
//
//  Scope is `packages/**` — the seven architecture buckets. `apps/` is
//  deliberately NOT scanned: it is its own npm install root, outside the
//  root workspaces, turbo, lint, the coverage gate and Sonar (CLAUDE.md,
//  docs/APPS_REPO.md), and it resolves the platform through Vite aliases or
//  packed tarballs rather than a workspace dep. Scanning it made
//  `npm run lint:all` fail on nine demo apps for a dependency they do not
//  and should not declare.
//
//  The roots below used to name `packages/shared/{foundation,runtime,
//  services,platform}`, `packages/react` and `packages/angular` — a layout
//  that no longer exists (see WORKLOG 11 / the bucket collapse). None of the
//  six resolved, so this check had silently stopped guarding any package at
//  all while still failing on the apps it should never have read.
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, '..', '..');

const SKIP_PKG_NAMES = new Set([
  '@wellsfargo-starui/design-system',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.turbo',
  'coverage',
  '__snapshots__',
]);

const DS_TOKEN_RE = /--ds-/;
const DS_IMPORT_RE = /from\s+['"]@wellsfargo-starui\/design-system(?:\/|['"])/;
const DS_DEP_KEY = '@wellsfargo-starui/design-system';

function walkDirs(dir: string, depth: number, maxDepth: number): string[] {
  const dirs: string[] = [];
  if (!existsSync(dir) || depth > maxDepth) return dirs;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return dirs;
  }
  for (const e of entries) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    dirs.push(full);
    dirs.push(...walkDirs(full, depth + 1, maxDepth));
  }
  return dirs;
}

/**
 * The workspace packages, read from the root manifest's `workspaces` list —
 * the seven architecture buckets, and exactly what npm considers a package
 * here.
 *
 * Deliberately NOT a directory walk for any package.json it can find: a
 * bucket member can carry a private build shim (`packages/core/engine`
 * exists only so vite-plugin-dts resolves its types entry, and says so in
 * its own manifest). Walking found those shims and demanded that each
 * declare the design-system dependency, when the source under them belongs
 * to the enclosing bucket — which declares it already.
 */
function findPackageDirs(): string[] {
  const rootPkg = JSON.parse(
    readFileSync(join(ROOT, 'package.json'), 'utf8'),
  ) as { workspaces?: string[] };
  const globs = rootPkg.workspaces ?? [];
  const pkgDirs: string[] = [];
  for (const g of globs) {
    // The root glob enumerates each bucket explicitly (npm 10 does not do
    // `packages/**`), so these are literal paths, not patterns.
    const dir = join(ROOT, g);
    if (existsSync(join(dir, 'package.json'))) pkgDirs.push(dir);
  }
  return pkgDirs;
}

/**
 * Does anything in this package's source reference the design system?
 *
 * Walks the package DIRECTORY, not `<pkg>/src`: a bucket keeps its source in
 * its members (`packages/core/engine/src`, `packages/core/host/src`, …), so
 * looking only for `<bucket>/src` found nothing at all and the check passed
 * vacuously. `SKIP_DIRS` keeps it off `node_modules` / `dist` / coverage, and
 * it early-returns on the first hit.
 */
function readSrcUsesDs(pkgDir: string): boolean {
  const srcDir = pkgDir;
  if (!existsSync(srcDir)) return false;

  const exts = new Set(['.tsx', '.ts', '.css', '.scss']);
  function scanFile(path: string): boolean {
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      return false;
    }
    if (DS_TOKEN_RE.test(raw)) return true;
    if (DS_IMPORT_RE.test(raw)) return true;
    return false;
  }

  function walkFiles(dir: string): boolean {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (walkFiles(full)) return true;
      } else if (e.isFile()) {
        const ext = e.name.includes('.') ? e.name.slice(e.name.lastIndexOf('.')) : '';
        if (!exts.has(ext)) continue;
        if (scanFile(full)) return true;
      }
    }
    return false;
  }

  return walkFiles(srcDir);
}

function hasDsDep(pkgJson: Record<string, unknown>): boolean {
  const blocks = ['dependencies', 'peerDependencies', 'devDependencies'] as const;
  for (const b of blocks) {
    const o = pkgJson[b];
    if (o && typeof o === 'object' && DS_DEP_KEY in (o as object)) return true;
  }
  return false;
}

/** True when pkg lives under `packages/angular/` (not enforced yet). */
function isAngularWorkspacePackage(pkgDir: string): boolean {
  const rel = relative(ROOT, pkgDir);
  const segments = rel.split(sep);
  return segments[0] === 'packages' && segments[1] === 'angular';
}

function main(): void {
  const errors: string[] = [];
  for (const pkgDir of findPackageDirs()) {
    const pkgPath = join(pkgDir, 'package.json');
    let pkgJson: Record<string, unknown>;
    try {
      pkgJson = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    const name = typeof pkgJson.name === 'string' ? pkgJson.name : '';
    if (!name || SKIP_PKG_NAMES.has(name)) continue;
    if (isAngularWorkspacePackage(pkgDir)) continue;

    if (!readSrcUsesDs(pkgDir)) continue;

    if (!hasDsDep(pkgJson)) {
      errors.push(
        `${name}: references --ds-* or imports @wellsfargo-starui/design-system but package.json lacks "${DS_DEP_KEY}" in dependencies / peerDependencies / devDependencies (${relative(ROOT, pkgDir)})`,
      );
    }
  }

  if (errors.length > 0) {
    console.error('check-design-system-deps failed:\n');
    for (const e of errors) console.error(`  • ${e}`);
    console.error(`\nAdd "${DS_DEP_KEY}": "*" (prefer peerDependencies for libraries consumed by apps).`);
    process.exit(1);
  }
  console.log('check-design-system-deps: OK');
}

main();
