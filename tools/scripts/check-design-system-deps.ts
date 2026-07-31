#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────
//  check-design-system-deps — workspace packages that reference
//  unified tokens (`--ds-*`) or import `@wellsfargo-starui/design-system/*`
//  must declare `@wellsfargo-starui/design-system` in dependencies,
//  peerDependencies, or devDependencies so consumers resolve one
//  coherent theme graph (npm sees the contract).
//
//  Angular (`packages/angular/**`) is skipped until DS adoption is wired there.
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

/** Workspace packages under packages (nested) and apps (flat). */
function findPackageDirs(): string[] {
  const roots = [
    join(ROOT, 'packages', 'shared', 'foundation'),
    join(ROOT, 'packages', 'shared', 'runtime'),
    join(ROOT, 'packages', 'shared', 'services'),
    join(ROOT, 'packages', 'shared', 'platform'),
    join(ROOT, 'packages', 'react'),
    join(ROOT, 'packages', 'angular'),
    join(ROOT, 'apps'),
  ];
  const out: string[] = [];
  for (const r of roots) {
    if (!existsSync(r)) continue;
    out.push(...walkDirs(r, 0, 10));
  }
  const pkgDirs: string[] = [];
  const seen = new Set<string>();
  for (const d of out) {
    const pkgPath = join(d, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const key = d;
    if (seen.has(key)) continue;
    seen.add(key);
    pkgDirs.push(d);
  }
  return pkgDirs;
}

function readSrcUsesDs(pkgDir: string): boolean {
  const srcDir = join(pkgDir, 'src');
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
