#!/usr/bin/env node
/**
 * propagate.mjs — build + pack architecture-bucket tarballs under libs/.
 *
 * One tarball per top-level folder under packages/ (e.g. react-core, shared,
 * design-system). Each bundle contains every workspace package in that bucket
 * and installs as `@wellsfargo-starui/<bucket>` (see packages/angular-core/README.md).
 *
 * Layout
 * ------
 *   libs/wellsfargo-starui-react-core.tgz     — apps install from here (stable name)
 *   dist/packages/starui-react-core-0.1.0.tgz — human-readable, version-stamped mirror
 *   libs/manifest.json                        — bucket → { bucket, members, filename, … }
 *
 * The libs/ tarball uses a stable, content-independent name (one per bucket).
 * Apps pin `file:libs/wellsfargo-starui-<bucket>.tgz` once; the path never changes when
 * the bucket's content changes, so app package.json files don't churn. Only
 * the lockfile integrity refreshes (handled by the post-pack `npm install`).
 *
 * Usage
 * -----
 *   npm run propagate                       # pack ALL buckets (rebuilds members)
 *   npm run build:consumer                  # turbo build:packages then propagate --no-build
 *   npm run propagate -- react-core           # one bucket (folder name)
 *   npm run propagate -- grid                 # bucket containing @wellsfargo-starui/grid
 *   npm run propagate -- @wellsfargo-starui/react-core
 *   npm run propagate -- --dry-run
 *   npm run propagate -- --gc                 # remove orphaned tarballs
 *   npm run propagate -- --no-install --no-build
 *   npm run propagate -- --refresh-lockfile
 *   npm run check:tarballs              # --check-only — fail if libs/ tarballs are stale
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');
const LIBS_DIR = join(REPO_ROOT, 'libs');
const DIST_DIR = join(REPO_ROOT, 'dist', 'packages');
const STAGING_ROOT = join(REPO_ROOT, '.propagate-staging');
const MANIFEST_PATH = join(LIBS_DIR, 'manifest.json');
const DIST_MANIFEST_PATH = join(DIST_DIR, 'manifest.json');
const LOCKFILE_PATH = join(REPO_ROOT, 'package-lock.json');

const SKIP_COPY = new Set(['node_modules', '.turbo', '.angular', '.git']);

// ────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = new Set();
  const names = [];
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a.slice(2));
    else if (a.length > 0) names.push(a);
  }
  return {
    names,
    dryRun: flags.has('dry-run'),
    gc: flags.has('gc'),
    noInstall: flags.has('no-install'),
    noBuild: flags.has('no-build'),
    refreshLockfile: flags.has('refresh-lockfile'),
    skipDriftCheck: flags.has('skip-drift-check'),
    checkOnly: flags.has('check-only'),
    help: flags.has('help'),
  };
}

const args = parseArgs(process.argv.slice(2));

function log(msg) {
  process.stdout.write(`[propagate] ${msg}\n`);
}

function die(msg) {
  process.stderr.write(`[propagate] ERROR: ${msg}\n`);
  process.exit(1);
}

if (args.help) {
  process.stdout.write(readFileSync(import.meta.filename, 'utf8').slice(0, 2400));
  process.exit(0);
}

function isDirectory(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

function hasPackageJson(dir) {
  try { statSync(join(dir, 'package.json')); return true; } catch { return false; }
}

// ────────────────────────────────────────────────────────────────────────
// Bucket discovery
// ────────────────────────────────────────────────────────────────────────

function readMemberPackage(memberDir) {
  const pkgPath = join(memberDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return {
    dir: memberDir,
    rel: relative(REPO_ROOT, memberDir),
    folder: relative(join(PACKAGES_ROOT, relative(PACKAGES_ROOT, memberDir).split('/')[0]), memberDir).split('/').pop()
      ?? relative(PACKAGES_ROOT, memberDir).split('/').pop(),
    name: pkg.name,
    version: pkg.version ?? '0.1.0',
    scripts: pkg.scripts ?? {},
  };
}

// Angular is excluded from the build pipeline — skip Angular buckets entirely
// and the lone Angular member that lives inside the (otherwise shared) data bucket.
const ANGULAR_BUCKETS = new Set(['angular-ui', 'angular-grid', 'angular-core']);
const ANGULAR_MEMBERS = new Set(['@wellsfargo-starui/host-data-angular']);

function discoverBuckets() {
  const buckets = [];
  for (const entry of readdirSync(PACKAGES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (ANGULAR_BUCKETS.has(entry.name)) continue;
    const bucketDir = join(PACKAGES_ROOT, entry.name);
    const members = [];
    for (const child of readdirSync(bucketDir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const memberDir = join(bucketDir, child.name);
      if (!hasPackageJson(memberDir)) continue;
      const member = readMemberPackage(memberDir);
      member.folder = child.name;
      if (ANGULAR_MEMBERS.has(member.name)) continue;
      members.push(member);
    }
    if (members.length === 0) continue;
    members.sort((a, b) => a.name.localeCompare(b.name));
    const bucketVersion = members.reduce(
      (max, m) => (m.version > max ? m.version : max),
      members[0].version,
    );
    buckets.push({
      bucket: entry.name,
      name: `@wellsfargo-starui/${entry.name}`,
      version: bucketVersion,
      dir: bucketDir,
      members,
    });
  }
  return buckets.sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function bucketMatchesTarget(bucket, target) {
  if (target === bucket.bucket) return true;
  if (target === bucket.name) return true;
  if (bucket.members.some((m) => m.name === target)) return true;
  const short = target.includes('/') ? target.split('/').pop() : target;
  if (bucket.members.some((m) => m.name.split('/').pop() === short)) return true;
  if (bucket.members.some((m) => m.folder === target)) return true;
  return false;
}

function selectBuckets(buckets, requestedNames) {
  if (requestedNames.length === 0) return buckets;
  const selected = [];
  const unmatched = new Set(requestedNames);
  for (const bucket of buckets) {
    if (requestedNames.some((n) => bucketMatchesTarget(bucket, n))) {
      selected.push(bucket);
      for (const n of [...unmatched]) {
        if (bucketMatchesTarget(bucket, n)) unmatched.delete(n);
      }
    }
  }
  if (unmatched.size > 0) {
    die(`unknown bucket or package: ${[...unmatched].join(', ')}`);
  }
  return selected;
}

// ────────────────────────────────────────────────────────────────────────
// Build + stage + pack
// ────────────────────────────────────────────────────────────────────────

/**
 * Build every workspace package once, in dependency order, via the repo's
 * `build:packages` (ensure-workspace-links + turbo). This replaces the old
 * per-member `npm run build` loop, which built buckets alphabetically and so
 * failed standalone: an early bucket (e.g. data/host-config) needs a later
 * bucket's output (shared/engine, built last alphabetically) already present.
 * Turbo honours the dependency graph and caches, so this is both correct and
 * fast (a no-op on a warm cache). Makes `npm run propagate` self-sufficient —
 * no separate `build:packages` step required first.
 */
function buildAllPackages() {
  if (args.noBuild) {
    log('build: skipped (--no-build)');
    return;
  }
  if (args.dryRun) {
    log('build: would run `npm run build:packages` (turbo, dependency order)');
    return;
  }
  log('build: npm run build:packages (turbo, dependency order)');
  execSync('npm run build:packages', { cwd: REPO_ROOT, stdio: 'inherit' });
}

function resolveExportTarget(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return value.import ?? value.default ?? value.types ?? null;
  }
  return null;
}

/** Merge member package.json exports into the bucket root for npm/tsc resolution. */
function buildBucketExports(bucket) {
  const exports = {};
  for (const member of bucket.members) {
    const memberPkg = JSON.parse(readFileSync(join(member.dir, 'package.json'), 'utf8'));
    const raw = memberPkg.exports && typeof memberPkg.exports === 'object'
      ? memberPkg.exports
      : { '.': memberPkg.main ?? memberPkg.module ?? './src/index.ts' };
    const hoist = member.name === bucket.name;

    for (const [exportKey, exportVal] of Object.entries(raw)) {
      const target = resolveExportTarget(exportVal);
      if (!target) continue;
      const relTarget = target.replace(/^\.\//, '');
      const physical = `./${member.folder}/${relTarget}`;

      if (hoist) {
        exports[exportKey] = physical;
        continue;
      }

      const short = member.name.split('/').pop();
      const bucketKey = exportKey === '.' ? `./${short}` : `./${short}${exportKey.slice(1)}`;
      exports[bucketKey] = physical;
    }
  }
  if (!exports['.'] && bucket.members.length === 1) {
    const only = bucket.members[0];
    const memberPkg = JSON.parse(readFileSync(join(only.dir, 'package.json'), 'utf8'));
    const main = memberPkg.main ?? memberPkg.module ?? './src/index.ts';
    exports['.'] = `./${only.folder}/${main.replace(/^\.\//, '')}`;
  }
  return exports;
}

function writeBucketPackageJson(stageDir, bucket) {
  const memberNames = bucket.members.map((m) => m.name);
  const pkg = {
    name: bucket.name,
    version: bucket.version,
    private: true,
    type: 'module',
    description:
      `@wellsfargo-starui/${bucket.bucket} architecture bucket — bundled tarball containing: `
      + `${memberNames.join(', ')}`,
    exports: buildBucketExports(bucket),
  };
  writeFileSync(join(stageDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
}

function copyMemberTree(srcDir, destDir) {
  cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(/[/\\]/);
      return !parts.some((p) => SKIP_COPY.has(p));
    },
  });
}

function stageBucket(bucket) {
  const stageDir = join(STAGING_ROOT, bucket.bucket);
  if (args.dryRun) {
    log(`stage: ${bucket.name} ← ${bucket.members.length} member(s) (dry-run)`);
    return stageDir;
  }
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  writeBucketPackageJson(stageDir, bucket);
  for (const member of bucket.members) {
    copyMemberTree(member.dir, join(stageDir, member.folder));
  }
  log(`stage: ${bucket.name} ← ${bucket.members.map((m) => m.folder).join(', ')}`);
  return stageDir;
}

function rawPackFilename(name, version) {
  const base = name.startsWith('@') ? name.slice(1).replace('/', '-') : name;
  return `${base}-${version}.tgz`;
}

function rawPack(cwd, packDestination = LIBS_DIR) {
  const stdout = execSync(
    `npm pack --pack-destination "${packDestination}" --json`,
    { cwd, stdio: ['ignore', 'pipe', 'inherit'] },
  ).toString();
  const jsonStart = stdout.indexOf('[');
  if (jsonStart === -1) throw new Error(`npm pack produced no JSON (cwd: ${cwd})`);
  const arr = JSON.parse(stdout.slice(jsonStart));
  const filename = arr[0]?.filename;
  if (!filename) throw new Error(`npm pack returned no filename (cwd: ${cwd})`);
  return filename;
}

function sha8OfFile(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex').slice(0, 8);
}

function writeDistMirror(srcPath, distFilename, prevDistFilename) {
  mkdirSync(DIST_DIR, { recursive: true });
  copyFileSync(srcPath, join(DIST_DIR, distFilename));
  if (prevDistFilename && prevDistFilename !== distFilename) {
    const oldPath = join(DIST_DIR, prevDistFilename);
    if (existsSync(oldPath)) unlinkSync(oldPath);
  }
}

/**
 * Stable, content-independent libs filename for a bucket — e.g.
 * `wellsfargo-starui-react-grid.tgz`. One tarball per bucket; the name never
 * carries the version or a content hash, so app `file:` pins stay put across
 * re-packs.
 */
function stableLibsFilename(bucket) {
  return `wellsfargo-starui-${bucket.bucket}.tgz`;
}

function packBucketToManifest(bucket, prevEntry) {
  const distFilename = rawPackFilename(bucket.name, bucket.version);
  const libsFilename = stableLibsFilename(bucket);
  if (args.dryRun) {
    log(`pack: ${bucket.name}@${bucket.version} → libs/${libsFilename} + dist/packages/${distFilename} (dry-run)`);
    return {
      filename: libsFilename,
      distFilename,
      sha: 'DRYRUN0',
      version: bucket.version,
      contentChanged: true,
    };
  }

  const stageDir = stageBucket(bucket);
  const packedFlat = rawPack(stageDir);
  const flatPath = join(LIBS_DIR, packedFlat);
  const sha = sha8OfFile(flatPath);
  const libsPath = join(LIBS_DIR, libsFilename);
  const contentChanged = !prevEntry || prevEntry.sha !== sha;

  // npm pack emits `starui-<bucket>-<version>.tgz`; move it onto the stable
  // name, overwriting any prior content for this bucket.
  if (resolve(flatPath) !== resolve(libsPath)) {
    if (existsSync(libsPath)) unlinkSync(libsPath);
    renameSync(flatPath, libsPath);
  }

  writeDistMirror(libsPath, distFilename, prevEntry?.distFilename);

  // Sweep away legacy tarballs for this bucket — both the old version+hash
  // names and the pre-rename `starui-<bucket>.tgz` stable name — so libs/ holds
  // exactly one tarball per bucket.
  const legacyPrefix = `starui-${bucket.bucket}-`;
  const legacyStable = `starui-${bucket.bucket}.tgz`;
  for (const entry of readdirSync(LIBS_DIR)) {
    if (entry === libsFilename || !entry.endsWith('.tgz')) continue;
    if (entry.startsWith(legacyPrefix) || entry === legacyStable) {
      unlinkSync(join(LIBS_DIR, entry));
      log(`  removed legacy tarball: ${entry}`);
    }
  }

  rmSync(stageDir, { recursive: true, force: true });

  log(
    `pack: ${bucket.name}@${bucket.version} → libs/${libsFilename} + dist/packages/${distFilename}`
      + ` [${bucket.members.length} members]${contentChanged ? '' : ' (unchanged)'}`,
  );
  return { filename: libsFilename, distFilename, sha, version: bucket.version, contentChanged };
}

// ────────────────────────────────────────────────────────────────────────
// Lockfile drift detection + recovery
// ────────────────────────────────────────────────────────────────────────

function readLockfile() {
  if (!existsSync(LOCKFILE_PATH)) return null;
  try { return JSON.parse(readFileSync(LOCKFILE_PATH, 'utf8')); } catch { return null; }
}

function sha512Base64(path) {
  return createHash('sha512').update(readFileSync(path)).digest('base64');
}

function detectLockfileDrift() {
  const lock = readLockfile();
  if (!lock) return [];
  const seen = new Map();
  for (const [pkgKey, entry] of Object.entries(lock.packages ?? {})) {
    const resolved = entry?.resolved;
    if (typeof resolved !== 'string' || !resolved.startsWith('file:')) continue;
    const path = resolved.slice('file:'.length);
    const m = path.match(/(?:^|\/)libs\/([^/]+\.tgz)$/);
    if (!m) continue;
    const file = m[1];
    const fullPath = join(LIBS_DIR, file);
    if (!existsSync(fullPath)) {
      if (!seen.has(file)) {
        seen.set(file, { file, expected: entry.integrity ?? null, actual: null, reason: 'missing', refs: [] });
      }
      seen.get(file).refs.push(pkgKey || '<root>');
      continue;
    }
    const recorded = entry.integrity ?? '';
    const actual = `sha512-${sha512Base64(fullPath)}`;
    if (!recorded) continue;
    if (recorded !== actual) {
      if (!seen.has(file)) {
        seen.set(file, { file, expected: recorded, actual, reason: 'mismatch', refs: [] });
      }
      seen.get(file).refs.push(pkgKey || '<root>');
    }
  }
  return [...seen.values()];
}

function refreshRootLockfile() {
  if (args.dryRun) {
    log('lockfile: would regenerate package-lock.json (dry-run)');
    return;
  }
  log('lockfile: regenerating package-lock.json from current libs/ state');
  if (existsSync(LOCKFILE_PATH)) unlinkSync(LOCKFILE_PATH);
  execSync('npm install', { cwd: REPO_ROOT, stdio: 'inherit' });
}

function syncRootLockfile() {
  if (args.noInstall) {
    log('root install: skipped (--no-install)');
    return;
  }
  if (args.dryRun) {
    log('root install: would run `npm install` (dry-run)');
    return;
  }
  log('root install: converging root lockfile with newly-packed tarballs');
  execSync('npm install --no-audit --no-fund', { cwd: REPO_ROOT, stdio: 'inherit' });
}

// ────────────────────────────────────────────────────────────────────────
// Manifest
// ────────────────────────────────────────────────────────────────────────

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const lifted = {};
    for (const [name, val] of Object.entries(raw)) {
      if (typeof val === 'string') {
        lifted[name] = { filename: val, version: null, sha: null, packedAt: null };
      } else {
        lifted[name] = val;
      }
    }
    return lifted;
  } catch {
    return {};
  }
}

function writeManifest(manifest) {
  if (args.dryRun) return;
  const sorted = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  log(`wrote: libs/manifest.json (${Object.keys(sorted).length} bucket entries)`);

  const distView = Object.fromEntries(
    Object.entries(sorted).map(([name, entry]) => [
      name,
      {
        filename: entry.distFilename ?? entry.filename,
        bucket: entry.bucket,
        members: entry.members,
        version: entry.version,
        sha: entry.sha,
        packedAt: entry.packedAt,
        libsFilename: entry.filename,
      },
    ]),
  );
  mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(DIST_MANIFEST_PATH, `${JSON.stringify(distView, null, 2)}\n`);
  log(`wrote: dist/packages/manifest.json (${Object.keys(distView).length} bucket entries)`);
}

// ────────────────────────────────────────────────────────────────────────
// Apps discovery (for tarball GC only — apps build from source and no longer
// reference libs/*.tgz, so propagate does not rewrite or install app deps).
// ────────────────────────────────────────────────────────────────────────

const APPS_ROOT = join(REPO_ROOT, 'apps');

const APPS_ROOT_PKG = join(APPS_ROOT, 'package.json');

function findAppPackageJsons() {
  if (!isDirectory(APPS_ROOT)) return [];
  const out = [];
  function walk(dir) {
    if (dir.split(/[\\/]/).includes('node_modules')) return;
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath) && pkgPath !== APPS_ROOT_PKG) {
      out.push(pkgPath);
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      walk(join(dir, entry.name));
    }
  }
  walk(APPS_ROOT);
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// GC
// ────────────────────────────────────────────────────────────────────────

function gcOrphanedTarballs(manifest, appPkgPaths) {
  const referenced = new Set();
  for (const entry of Object.values(manifest)) {
    if (entry?.filename) referenced.add(entry.filename);
  }
  for (const appPkgPath of appPkgPaths) {
    const pkg = JSON.parse(readFileSync(appPkgPath, 'utf8'));
    for (const depKey of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const deps = pkg[depKey];
      if (!deps) continue;
      for (const spec of Object.values(deps)) {
        if (typeof spec !== 'string') continue;
        const m = spec.match(/\/libs\/([^/]+\.tgz)$/);
        if (m) referenced.add(m[1]);
      }
    }
  }
  let removed = 0;
  if (!isDirectory(LIBS_DIR)) return;
  for (const entry of readdirSync(LIBS_DIR)) {
    if (!entry.endsWith('.tgz')) continue;
    if (referenced.has(entry)) continue;
    const path = join(LIBS_DIR, entry);
    if (args.dryRun) log(`gc: would remove ${entry}`);
    else {
      unlinkSync(path);
      log(`gc: removed ${entry}`);
    }
    removed++;
  }
  if (removed === 0) log('gc: no orphaned tarballs in libs/');
}

function gcOrphanedDist(manifest) {
  if (!isDirectory(DIST_DIR)) return;
  const referenced = new Set();
  for (const entry of Object.values(manifest)) {
    if (entry?.distFilename) referenced.add(entry.distFilename);
  }
  let removed = 0;
  for (const entry of readdirSync(DIST_DIR)) {
    if (!entry.endsWith('.tgz')) continue;
    if (referenced.has(entry)) continue;
    const path = join(DIST_DIR, entry);
    if (args.dryRun) log(`gc: would remove dist/packages/${entry}`);
    else {
      unlinkSync(path);
      log(`gc: removed dist/packages/${entry}`);
    }
    removed++;
  }
  if (removed === 0) log('gc: no orphaned tarballs in dist/packages');
}

// ────────────────────────────────────────────────────────────────────────
// Check-only — verify committed tarballs match a fresh pack (no writes)
// ────────────────────────────────────────────────────────────────────────

function computeBucketSha(bucket) {
  const checkDir = join(STAGING_ROOT, 'check-pack');
  mkdirSync(checkDir, { recursive: true });
  for (const entry of readdirSync(checkDir)) {
    if (entry.endsWith('.tgz')) unlinkSync(join(checkDir, entry));
  }
  const stageDir = stageBucket(bucket);
  const packedFlat = rawPack(stageDir, checkDir);
  const flatPath = join(checkDir, packedFlat);
  const sha = sha8OfFile(flatPath);
  unlinkSync(flatPath);
  rmSync(stageDir, { recursive: true, force: true });
  return sha;
}

function runCheckOnly() {
  log('CHECK ONLY — comparing libs/ tarballs to a fresh pack (no writes)');
  const buckets = discoverBuckets();
  const targets = selectBuckets(buckets, args.names);
  if (targets.length === 0) die('no architecture buckets selected');

  const manifest = readManifest();
  const stale = [];

  buildAllPackages();

  for (const bucket of targets) {
    const prev = manifest[bucket.name];
    const sha = computeBucketSha(bucket);
    const libsPath = prev?.filename ? join(LIBS_DIR, prev.filename) : null;
    const onDisk = libsPath && existsSync(libsPath) ? sha8OfFile(libsPath) : null;

    if (!prev?.sha || prev.sha !== sha || onDisk !== sha) {
      stale.push({
        bucket: bucket.name,
        expectedSha: prev?.sha ?? '(none)',
        computedSha: sha,
        onDiskSha: onDisk ?? '(missing)',
        filename: prev?.filename ?? '(none)',
      });
    } else {
      log(`fresh: ${bucket.name} (${sha})`);
    }
  }

  rmSync(STAGING_ROOT, { recursive: true, force: true });

  if (stale.length === 0) {
    log(`done — ${targets.length} bucket tarball(s) match current package build output`);
    return;
  }

  for (const s of stale) {
    log(`stale: ${s.bucket} manifest=${s.expectedSha} computed=${s.computedSha} on-disk=${s.onDiskSha} file=${s.filename}`);
  }
  die(
    `${stale.length} bucket tarball(s) are stale relative to packages/. `
      + 'Run `npm run propagate` and commit libs/ + package-lock.json changes.',
  );
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

function main() {
  if (args.checkOnly) {
    runCheckOnly();
    return;
  }
  log(`repo root: ${REPO_ROOT}`);
  if (args.dryRun) log('DRY RUN — no files will be written');
  if (!isDirectory(LIBS_DIR)) {
    if (args.dryRun) log('would create: libs/');
    else mkdirSync(LIBS_DIR, { recursive: true });
  }

  // When `--refresh-lockfile` clears drift, the regen must run AFTER packing:
  // regenerating now (while the referenced tarballs are still missing) makes
  // `npm install` write degenerate nodes (version-only, no resolved/integrity)
  // that resolve to the registry and fail with ETARGET. Deferred to the
  // end-of-run lockfile step below.
  let refreshLockfilePending = false;
  if (!args.skipDriftCheck) {
    const drift = detectLockfileDrift();
    if (drift.length > 0) {
      log(`lockfile drift: ${drift.length} tarball(s) in libs/`);
      for (const d of drift) {
        log(`  - ${d.file} (${d.reason === 'missing' ? 'missing' : 'sha512 mismatch'})`);
      }
      if (args.refreshLockfile) {
        refreshLockfilePending = true;
        log('lockfile: will regenerate package-lock.json after packing (referenced tarballs missing now)');
      } else {
        die(
          'package-lock.json is stale relative to libs/. Re-run with `--refresh-lockfile`\n'
          + '       or `--skip-drift-check` to bypass.',
        );
      }
    } else {
      log('lockfile drift: none');
    }
  }

  const buckets = discoverBuckets();
  const targets = selectBuckets(buckets, args.names);
  if (targets.length === 0) {
    log('no architecture buckets selected');
    return;
  }
  log(`buckets: ${targets.length} (${targets.map((b) => b.bucket).join(', ')})`);

  buildAllPackages();

  const manifest = readManifest();
  const updates = {};
  const now = new Date().toISOString();

  for (const bucket of targets) {
    const prev = manifest[bucket.name];
    const result = packBucketToManifest(bucket, prev);
    manifest[bucket.name] = {
      bucket: bucket.bucket,
      members: bucket.members.map((m) => m.name),
      filename: result.filename,
      distFilename: result.distFilename,
      version: result.version,
      sha: result.sha,
      packedAt: now,
    };
    updates[bucket.name] = { ...manifest[bucket.name], contentChanged: result.contentChanged };
  }

  // Drop legacy per-package manifest entries from the pre-bucket era.
  for (const key of Object.keys(manifest)) {
    const entry = manifest[key];
    if (!entry?.bucket || !entry?.members?.length) delete manifest[key];
  }

  writeManifest(manifest);

  // Apps build from source (Vite aliases @wellsfargo-starui/* → packages/) and no longer
  // depend on libs/*.tgz, so propagate neither rewrites nor installs app deps.
  // The tarballs + manifest exist for external (Artifactory) consumers only.

  if (refreshLockfilePending) {
    // Tarballs now exist, so a clean regen writes correct resolved/integrity
    // nodes for every bucket in the root lockfile.
    refreshRootLockfile();
  } else if (Object.keys(updates).length > 0) {
    syncRootLockfile();
  }

  if (args.gc) {
    gcOrphanedTarballs(manifest, findAppPackageJsons());
    gcOrphanedDist(manifest);
  }

  if (!args.dryRun) rmSync(STAGING_ROOT, { recursive: true, force: true });

  if (!args.skipDriftCheck && !args.dryRun) {
    const drift = detectLockfileDrift();
    if (drift.length > 0) {
      log(`WARNING: lockfile drift still present (${drift.length} tarball(s))`);
      for (const d of drift) log(`  - ${d.file}`);
    }
  }

  log(`done — packed ${Object.keys(updates).length} bucket(s)`);
}

main();
