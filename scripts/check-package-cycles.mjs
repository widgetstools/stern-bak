#!/usr/bin/env node
/**
 * check-package-cycles.mjs — fail if @wellsfargo-starui/* packages form dependency cycles.
 *
 * Checks:
 *   1. package.json declared deps (dependencies + peer + dev + optional)
 *   2. Source imports (`from '@wellsfargo-starui/…'`) between packages under packages/
 *   3. Member-level imports inside collapsed buckets (see below)
 *   4. Undeclared cross-package imports (warn by default; --strict exits non-zero)
 *
 * Why the member graph (check 3): after the package collapse every bucket is one
 * published package, so all intra-bucket wiring goes through the bucket's own
 * subpaths (`@wellsfargo-starui/core/host`, `@wellsfargo-starui/react/widget-sdk`). The
 * package-level graphs drop self-package imports and therefore cannot see an
 * intra-bucket cycle (e.g. engine ↔ host inside core/). The member graph gives
 * every src/-bearing member folder its own node (`<pkgName>#<folder>`), maps
 * import subpaths to members via the bucket's exports map (longest-prefix
 * match), and also follows relative imports that escape the importing member's
 * folder. Non-collapsed packages stay single nodes; the
 * engine build shim (core-engine-build-shim, unscoped) is ignored like
 * everywhere else.
 *
 * Usage:
 *   npm run check:deps
 *   npm run check:deps -- --strict
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';

const STRICT = process.argv.includes('--strict');
const REPO_ROOT = join(import.meta.dirname, '..');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.angular']);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs)$/;
const IMPORT_RE = /(?:from|import\s*\()\s*['"]([^'"]+)['"]/g;

// Member walk only. Additionally matches bare side-effect imports
// (`import './x.css'`) via the optional paren — kept separate from IMPORT_RE
// so the package-level checks' behavior stays exactly as before.
// The lookbehind rejects `@import` CSS examples and identifier-suffixed hits
// inside doc comments — without it, prose like `@import '@wellsfargo-starui/...'`
// fabricates member edges (and, paired with a snippet in the other package,
// fabricated a whole cycle in review).
const MEMBER_IMPORT_RE = /(?<![\w@.])(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
// Coverage reports contain generated .js the member graph must not read.
const MEMBER_SKIP_DIRS = new Set([...SKIP_DIRS, 'coverage']);

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

function firstTarget(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    for (const value of Object.values(entry)) {
      const found = firstTarget(value);
      if (found) return found;
    }
  }
  return null;
}

function exportSubpaths(exportsMap) {
  // "./host": "./host/dist/index.js" — the target's first path segment is the
  // owning member folder. Condition objects ({ types, import, … }) all point
  // into the same member, so the first string found is enough.
  const subpaths = [];
  for (const [key, entry] of Object.entries(exportsMap)) {
    const target = firstTarget(entry);
    if (!target?.startsWith('./')) continue;
    subpaths.push({ key: key.replace(/\/\*$/, ''), member: target.slice(2).split('/')[0] });
  }
  return subpaths;
}

function loadBuckets(dirToName) {
  // Collapsed bucket = @wellsfargo-starui/* package.json directly under
  // packages/<bucket>/. Members are the union of (a) immediate subfolders
  // containing src/ and (b) folders the bucket's exports map names as owners —
  // (b) exists for icons-svg, which keeps its sources at the member root with
  // no src/ and would otherwise drop out of the graph silently, taking every
  // edge through its five published subpaths with it. Subfolders with their
  // own scoped package.json stay package-level nodes, and
  // unscoped manifests (the engine build shim) were never in dirToName, so
  // engine/ remains an ordinary member. An exports target whose owning folder
  // cannot be registered is a loud warning, not a silent drop.
  const buckets = new Map();
  for (const [dir, name] of dirToName) {
    if (dirname(dir) !== PACKAGES_ROOT) continue;
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const subpaths = exportSubpaths(pkg.exports ?? {});
    const members = new Set();
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isDirectory() || SKIP_DIRS.has(ent.name)) continue;
      if (dirToName.has(join(dir, ent.name))) continue;
      if (existsSync(join(dir, ent.name, 'src'))) members.add(ent.name);
    }
    for (const { member } of subpaths) {
      if (members.has(member)) continue;
      const memberDir = join(dir, member);
      if (SKIP_DIRS.has(member) || dirToName.has(memberDir)) continue;
      if (existsSync(memberDir) && readdirSync(dir).includes(member)) {
        members.add(member);
      } else {
        console.warn(
          `WARN ${name}: exports map names member folder '${member}' which does not exist — member graph may be incomplete`,
        );
      }
    }
    buckets.set(name, { dir, members, subpaths });
  }
  return buckets;
}

function memberForSubpath(bucket, subpath) {
  // Longest-prefix match on segment boundaries; "." matches everything and so
  // only wins as the fallback.
  let best = null;
  for (const { key, member } of bucket.subpaths) {
    if (subpath !== key && !subpath.startsWith(key === '.' ? './' : `${key}/`)) continue;
    if (!best || key.length > best.key.length) best = { key, member };
  }
  return best?.member ?? null;
}

function memberNodeForPath(path, dirToName, buckets) {
  let dir = dirname(path);
  while (dir.startsWith(PACKAGES_ROOT)) {
    if (dirToName.has(dir)) {
      const name = dirToName.get(dir);
      const bucket = buckets.get(name);
      if (!bucket) return name; // non-collapsed package: single node
      const folder = relative(dir, path).split(sep)[0];
      return bucket.members.has(folder) ? `${name}#${folder}` : null;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function memberNodeForImport(spec, buckets, nodes) {
  const pkgName = spec.split('/').slice(0, 2).join('/');
  const bucket = buckets.get(pkgName);
  if (!bucket) return nodes.has(pkgName) ? pkgName : null;
  const rest = spec.slice(pkgName.length + 1);
  const member = memberForSubpath(bucket, rest ? `./${rest}` : '.');
  const node = member ? `${pkgName}#${member}` : null;
  return node && nodes.has(node) ? node : null;
}

function memberEdgeTarget(spec, file, dirToName, buckets, nodes) {
  if (spec.startsWith('@wellsfargo-starui/')) return memberNodeForImport(spec, buckets, nodes);
  if (!spec.startsWith('.')) return null;
  // Relative import: resolve it and attribute the resolved path to its owning
  // member. One that stays inside the importing member resolves to the same
  // node and is dropped by the self-edge check at the call site.
  return memberNodeForPath(normalize(join(dirname(file), spec)), dirToName, buckets);
}

function loadMemberGraph(dirToName, buckets) {
  const graph = new Map();
  for (const name of dirToName.values()) {
    if (!buckets.has(name)) graph.set(name, new Set());
  }
  for (const [name, bucket] of buckets) {
    for (const folder of bucket.members) graph.set(`${name}#${folder}`, new Set());
  }

  function walk(dir) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (MEMBER_SKIP_DIRS.has(ent.name)) continue;
        walk(p);
      } else if (SOURCE_EXT.test(ent.name) && !/\.d\.ts$/.test(ent.name)) {
        const from = memberNodeForPath(p, dirToName, buckets);
        if (!from) continue;
        const src = readFileSync(p, 'utf8');
        let match;
        MEMBER_IMPORT_RE.lastIndex = 0;
        while ((match = MEMBER_IMPORT_RE.exec(src))) {
          const to = memberEdgeTarget(match[1], p, dirToName, buckets, graph);
          if (to && to !== from && graph.has(to)) graph.get(from).add(to);
        }
      }
    }
  }

  walk(PACKAGES_ROOT);
  return graph;
}

function countIntraBucketEdges(memberGraph) {
  let count = 0;
  for (const [from, deps] of memberGraph) {
    if (!from.includes('#')) continue;
    const bucket = from.split('#')[0];
    for (const to of deps) {
      if (to.includes('#') && to.split('#')[0] === bucket) count++;
    }
  }
  return count;
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
const buckets = loadBuckets(dirToName);
const memberGraph = loadMemberGraph(dirToName, buckets);

const pkgCycles = findCycles(pkgGraph);
const importCycles = findCycles(importGraph);
const memberCycles = findCycles(memberGraph);
const undeclared = findUndeclared(importGraph, declared);

let ok = true;
ok = reportCycles('package.json @wellsfargo-starui/* dependencies', pkgCycles) && ok;
ok = reportCycles('source @wellsfargo-starui/* imports between packages', importCycles) && ok;
ok = reportCycles('member-level imports (bucket subpaths + relative escapes)', memberCycles) && ok;

console.log(
  `info packages=${pkgGraph.size} declared-edges=${[...pkgGraph.values()].reduce((n, s) => n + s.size, 0)} import-edges=${[...importGraph.values()].reduce((n, s) => n + s.size, 0)} members=${memberGraph.size} intra-bucket-edges=${countIntraBucketEdges(memberGraph)}`,
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
