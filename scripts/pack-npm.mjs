/**
 * pack-npm.mjs — pack every publishable @wellsfargo-starui package as an
 * INDIVIDUAL npm tarball, ready for `npm publish` to Artifactory (or a
 * `file:` install by teams without registry access).
 *
 * Why this exists alongside `propagate.mjs`: propagate packs one tarball
 * per architecture BUCKET, renaming everything to
 * `@wellsfargo-starui/<bucket>` with `./<member>` subpaths. That shape
 * only resolves through the repo's Vite alias layer, because every
 * shipped `dist` file imports its siblings by their real member name
 * (`@wellsfargo-starui/engine`). External consumers get the member
 * packages instead — the standard npm model, no aliases, no config.
 *
 * Per package it stages a copy and rewrites the manifest so it is
 * actually installable:
 *   - drops `private: true` (npm refuses to publish otherwise)
 *   - rewrites workspace `"*"` dependency ranges to the concrete
 *     version of that workspace package (`^0.1.0`), so npm can resolve
 *     the graph from a registry
 *   - leaves everything else (exports/files/peerDeps) untouched
 *
 * Usage:
 *   node scripts/pack-npm.mjs                 # pack all → dist-npm/
 *   node scripts/pack-npm.mjs --dry-run       # print the plan
 *   node scripts/pack-npm.mjs grid engine     # pack a subset
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

// Angular is out of the build pipeline (see CLAUDE.md) — never packed. The
// angular-* buckets have been deleted; host-data-angular is the last one left.
const SKIP_BUCKETS = new Set();
const SKIP_MEMBERS = new Set(['@wellsfargo-starui/host-data-angular']);
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

function discover() {
  const out = [];
  for (const bucket of readdirSync(PACKAGES_ROOT)) {
    if (SKIP_BUCKETS.has(bucket)) continue;
    const bucketDir = path.join(PACKAGES_ROOT, bucket);
    if (!statSync(bucketDir).isDirectory()) continue;
    for (const folder of readdirSync(bucketDir)) {
      const dir = path.join(bucketDir, folder);
      const pj = path.join(dir, 'package.json');
      if (!statSync(dir).isDirectory() || !existsSync(pj)) continue;
      const pkg = JSON.parse(readFileSync(pj, 'utf8'));
      if (!pkg.name?.startsWith('@wellsfargo-starui/')) continue;
      if (SKIP_MEMBERS.has(pkg.name)) continue;
      out.push({ dir, pkg, short: pkg.name.split('/').pop() });
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
  // must not truncate the record of everything already packed.
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const byName = new Map();
  if (existsSync(manifestPath)) {
    try {
      for (const p of JSON.parse(readFileSync(manifestPath, 'utf8')).packages ?? []) {
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
