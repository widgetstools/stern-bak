/**
 * pack-npm.mjs — pack every publishable @wellsfargo-starui package as an
 * INDIVIDUAL npm tarball, ready for `npm publish` to Artifactory (or a
 * `file:` install by teams without registry access).
 *
 * This is the only packing path: one tarball per collapsed bucket package,
 * under its real npm name — the standard npm model, no aliases, no build
 * config on the consumer side. (The old bucket-tarball `propagate.mjs`
 * shape is gone; see docs/APPS_REPO.md for why it could never be
 * installed externally.)
 *
 * Per package it stages a copy and rewrites the manifest so it is
 * actually installable:
 *   - drops `private: true` (npm refuses to publish otherwise)
 *   - rewrites workspace `"*"` dependency ranges to the concrete
 *     version of that workspace package (`^0.1.0`), so npm can resolve
 *     the graph from a registry
 *   - leaves everything else (exports/files/peerDeps) untouched
 *
 * Stale-output pruning (package-collapse sub-phase 7, spec section 4):
 * `dist-npm/` used to accumulate tarballs for retired package names
 * forever (18 pre-collapse tarballs survived the collapse). A full pack
 * now wipes the directory and rebuilds the manifest from exactly that
 * run; a subset pack keeps the merge but deletes any tarball + manifest
 * entry whose package name is no longer in the discovery set.
 *
 * Usage:
 *   node scripts/pack-npm.mjs                 # pack all → dist-npm/
 *   node scripts/pack-npm.mjs --dry-run       # print the plan
 *   node scripts/pack-npm.mjs grid core       # pack a subset
 *   node scripts/pack-npm.mjs --version 1.2.3 # stamp one version on all
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES_ROOT = path.join(REPO_ROOT, 'packages');
const OUT_DIR = path.join(REPO_ROOT, 'dist-npm');
const STAGE_ROOT = path.join(REPO_ROOT, 'node_modules', '.cache', 'pack-npm');

const SKIP_BUCKETS = new Set();
const SKIP_MEMBERS = new Set();
const SKIP_COPY = new Set(['node_modules', '.turbo', '.git', '.angular']);

const rawArgs = process.argv.slice(2);
const args = { dryRun: false, version: null, only: [] };
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === '--dry-run') args.dryRun = true;
  else if (a === '--version') args.version = rawArgs[++i];
  else args.only.push(a.replace(/^@wellsfargo-starui\//, ''));
}

const log = (m) => console.log(`[pack-npm] ${m}`);

function tryAdd(out, dir) {
  const pj = path.join(dir, 'package.json');
  if (!existsSync(pj)) return false;
  const pkg = JSON.parse(readFileSync(pj, 'utf8'));
  if (!pkg.name?.startsWith('@wellsfargo-starui/')) return false;
  out.push({ dir, pkg, short: pkg.name.split('/').pop() });
  return true;
}

function discover() {
  const out = [];
  for (const bucket of readdirSync(PACKAGES_ROOT)) {
    if (SKIP_BUCKETS.has(bucket)) continue;
    const bucketDir = path.join(PACKAGES_ROOT, bucket);
    if (!statSync(bucketDir).isDirectory()) continue;
    // Collapsed bucket (WORKLOG #11 phase 2): one package.json at the
    // bucket root, member subfolders are source-only. Don't also recurse
    // into members in this case — they no longer have their own
    // package.json anyway, so the loop below is a no-op for them.
    if (tryAdd(out, bucketDir)) continue;
    for (const folder of readdirSync(bucketDir)) {
      const dir = path.join(bucketDir, folder);
      if (!statSync(dir).isDirectory()) continue;
      tryAdd(out, dir);
    }
  }
  return out.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name));
}

const all = discover();
const versionByName = new Map(all.map((m) => [m.pkg.name, args.version ?? m.pkg.version]));

function rewriteDeps(block) {
  if (!block) return block;
  const out = {};
  for (const [name, range] of Object.entries(block)) {
    if (name.startsWith('@wellsfargo-starui/') && (range === '*' || range === 'workspace:*')) {
      const v = versionByName.get(name);
      if (!v) {
        // A workspace dep we do not pack (Angular member) — leave as-is
        // and let the consumer's registry resolve or fail loudly.
        out[name] = range;
        continue;
      }
      out[name] = `^${v}`;
    } else {
      out[name] = range;
    }
  }
  return out;
}

function stage(member) {
  const stageDir = path.join(STAGE_ROOT, member.short);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  cpSync(member.dir, stageDir, {
    recursive: true,
    filter: (src) => !src.split(/[/\\]/).some((p) => SKIP_COPY.has(p)),
  });

  const pkg = JSON.parse(readFileSync(path.join(stageDir, 'package.json'), 'utf8'));
  delete pkg.private;
  if (args.version) pkg.version = args.version;
  if (pkg.dependencies) pkg.dependencies = rewriteDeps(pkg.dependencies);
  if (pkg.peerDependencies) pkg.peerDependencies = rewriteDeps(pkg.peerDependencies);
  // devDependencies never ship in a tarball's install graph.
  delete pkg.devDependencies;
  writeFileSync(path.join(stageDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  return { stageDir, pkg };
}

function main() {
  // A typo'd or retired selector must fail loudly — silently packing the rest
  // reads as success while the intended package never ships.
  const shorts = new Set(all.map((m) => m.short));
  const unknown = args.only.filter((s) => !shorts.has(s));
  if (unknown.length > 0) {
    console.error(
      `[pack-npm] unknown package selector(s): ${unknown.join(', ')} — valid: ${[...shorts].sort().join(', ')}`,
    );
    process.exit(1);
  }
  const selected = args.only.length
    ? all.filter((m) => args.only.includes(m.short))
    : all;
  if (selected.length === 0) {
    console.error('[pack-npm] no packages matched');
    process.exit(1);
  }

  if (args.dryRun) {
    for (const m of selected) {
      const v = versionByName.get(m.pkg.name);
      log(`would pack ${m.pkg.name}@${v}${m.pkg.private ? ' (private → dropped)' : ''}`);
    }
    return;
  }

  // Full pack: this run is the complete record — wipe the directory so
  // tarballs for retired package identities can never linger.
  const fullPack = args.only.length === 0;
  if (fullPack) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const packed = [];
  for (const member of selected) {
    const { stageDir, pkg } = stage(member);
    const stdout = execFileSync('npm', ['pack', '--pack-destination', OUT_DIR], {
      cwd: stageDir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const file = stdout.trim().split(/\r?\n/).pop();
    packed.push({ name: pkg.name, version: pkg.version, file });
    log(`packed ${pkg.name}@${pkg.version} → dist-npm/${file}`);
  }

  // Merge into any existing manifest — a partial run (`pack:npm grid`)
  // must not truncate the record of everything already packed. Entries
  // whose package name is no longer discoverable are retired identities:
  // prune both the entry and its tarball so they can never linger.
  // (A full pack wiped the directory above, so this loop is a no-op then.)
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const knownNames = new Set(all.map((m) => m.pkg.name));
  const byName = new Map();
  if (existsSync(manifestPath)) {
    try {
      for (const p of JSON.parse(readFileSync(manifestPath, 'utf8')).packages ?? []) {
        if (!knownNames.has(p.name)) {
          rmSync(path.join(OUT_DIR, p.file), { force: true });
          log(`pruned retired ${p.name} (${p.file})`);
          continue;
        }
        if (existsSync(path.join(OUT_DIR, p.file))) byName.set(p.name, p);
      }
    } catch { /* regenerate from scratch on a corrupt manifest */ }
  }
  for (const p of packed) byName.set(p.name, p);
  const merged = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), packages: merged }, null, 2)}\n`,
  );
  log(`${packed.length} package(s) → ${path.relative(REPO_ROOT, OUT_DIR)}/`);
}

main();
