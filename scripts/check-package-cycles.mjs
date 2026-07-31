#!/usr/bin/env node
/**
 * check-package-cycles.mjs — fail if @wellsfargo-starui/* packages form dependency cycles.
 *
 * Checks:
 *   1. package.json declared deps (dependencies + peer + dev + optional)
 *   2. Source imports (`from '@wellsfargo-starui/…'`) between packages under packages/
 *   3. Undeclared cross-package imports (warn by default; --strict exits non-zero)
 *
 * Usage:
 *   npm run check:deps
 *   npm run check:deps -- --strict
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const STRICT = process.argv.includes('--strict');
const REPO_ROOT = join(import.meta.dirname, '..');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.angular']);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs)$/;
const IMPORT_RE = /(?:from|import\s*\()\s*['"]([^'"]+)['"]/g;

function findPackageJsons(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      findPackageJsons(p, acc);
    } else if (ent.name === 'package.json') {
      acc.push(p);
    }
  }
  return acc;
}

function staruiDepsFromPkg(pkg) {
  const deps = new Set();
  for (const section of [
    'dependencies',
    'peerDependencies',
    'devDependencies',
    'optionalDependencies',
  ]) {
    for (const name of Object.keys(pkg[section] ?? {})) {
      if (name.startsWith('@wellsfargo-starui/')) deps.add(name);
    }
  }
  return deps;
}

function loadPackageGraph() {
  const dirToName = new Map();
  const graph = new Map();
  const declared = new Map();

  for (const pkgPath of findPackageJsons(PACKAGES_ROOT)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (!pkg.name?.startsWith('@wellsfargo-starui/')) continue;
    const dir = dirname(pkgPath);
    dirToName.set(dir, pkg.name);
    graph.set(pkg.name, new Set());
    declared.set(pkg.name, staruiDepsFromPkg(pkg));
  }

  for (const [name, deps] of declared) {
    for (const dep of deps) {
      if (graph.has(dep)) graph.get(name).add(dep);
    }
  }

  return { dirToName, graph, declared };
}

function packageForFile(file, dirToName) {
  let dir = dirname(file);
  while (dir.startsWith(PACKAGES_ROOT)) {
    if (dirToName.has(dir)) return dirToName.get(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function loadImportGraph(dirToName) {
  const graph = new Map();
  for (const name of dirToName.values()) graph.set(name, new Set());

  function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        walk(p);
      } else if (SOURCE_EXT.test(ent.name) && !/\.d\.ts$/.test(ent.name)) {
        const from = packageForFile(p, dirToName);
        if (!from) continue;
        const src = readFileSync(p, 'utf8');
        let match;
        IMPORT_RE.lastIndex = 0;
        while ((match = IMPORT_RE.exec(src))) {
          const spec = match[1];
          if (!spec.startsWith('@wellsfargo-starui/')) continue;
          const to = spec.split('/').slice(0, 2).join('/');
          if (graph.has(to) && to !== from) graph.get(from).add(to);
        }
      }
    }
  }

  walk(PACKAGES_ROOT);
  return graph;
}

function findCycles(graph) {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function dfs(node) {
    if (visiting.has(node)) {
      cycles.push(stack.slice(stack.indexOf(node)).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const dep of graph.get(node) ?? []) dfs(dep);
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) dfs(node);

  const seen = new Set();
  return cycles.filter((cycle) => {
    const key = cycle.slice(0, -1).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findUndeclared(importGraph, declared) {
  const missing = [];
  for (const [from, imports] of importGraph) {
    const allowed = declared.get(from) ?? new Set();
    for (const to of imports) {
      if (!allowed.has(to)) missing.push({ from, to });
    }
  }
  return missing.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

function reportCycles(label, cycles) {
  if (cycles.length === 0) {
    console.log(`OK  ${label}: no cycles (${cycles.length === 0 ? 'acyclic' : ''})`);
    return true;
  }
  console.error(`FAIL ${label}: ${cycles.length} cycle(s)`);
  for (const cycle of cycles) {
    console.error(`  ${cycle.join(' → ')}`);
  }
  return false;
}

const { dirToName, graph: pkgGraph, declared } = loadPackageGraph();
const importGraph = loadImportGraph(dirToName);

const pkgCycles = findCycles(pkgGraph);
const importCycles = findCycles(importGraph);
const undeclared = findUndeclared(importGraph, declared);

let ok = true;
ok = reportCycles('package.json @wellsfargo-starui/* dependencies', pkgCycles) && ok;
ok = reportCycles('source @wellsfargo-starui/* imports between packages', importCycles) && ok;

console.log(
  `info packages=${pkgGraph.size} declared-edges=${[...pkgGraph.values()].reduce((n, s) => n + s.size, 0)} import-edges=${[...importGraph.values()].reduce((n, s) => n + s.size, 0)}`,
);

if (undeclared.length === 0) {
  console.log('OK  all cross-package imports are declared in package.json');
} else {
  const msg = `${undeclared.length} cross-package import(s) not declared in package.json`;
  if (STRICT) {
    console.error(`FAIL ${msg}:`);
    ok = false;
  } else {
    console.warn(`WARN ${msg} (pass --strict to fail):`);
  }
  for (const { from, to } of undeclared) {
    console.warn(`  ${from} imports ${to}`);
  }
}

if (!ok) process.exit(1);
console.log('check-package-cycles: passed');
