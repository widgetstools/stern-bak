#!/usr/bin/env node
/**
 * Pack all dependencies (direct + transitive) into the app's libs/ folder.
 * Usage: node scripts/pack-all-deps.js <app-dir>
 *
 * Reads package-lock.json to enumerate every resolved package, then runs
 * `npm pack <name>@<version>` into libs/.  Existing .tgz files that match
 * are skipped.  After packing, prints a JSON map of { "pkg-name": "filename.tgz" }
 * that the caller can use to rewrite package.json.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(process.argv[2] || '.');
const lockPath = path.join(appDir, 'package-lock.json');
const libsDir = path.join(appDir, 'libs');

if (!fs.existsSync(lockPath)) {
  console.error('No package-lock.json found in', appDir);
  process.exit(1);
}

fs.mkdirSync(libsDir, { recursive: true });

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages || {};

// Collect unique name@version pairs (skip root "" and file: deps)
const topack = new Map();
for (const [key, info] of Object.entries(packages)) {
  if (!key || key === '') continue; // root
  if (info.link) continue; // symlinks
  if (info.resolved && info.resolved.startsWith('file:')) continue; // local tarballs

  // Extract package name from the node_modules path
  const parts = key.replace(/^node_modules\//, '').split('node_modules/');
  const name = parts[parts.length - 1];
  if (!name || !info.version) continue;

  const id = `${name}@${info.version}`;
  if (!topack.has(id)) {
    topack.set(id, { name, version: info.version });
  }
}

console.log(`Found ${topack.size} packages to pack into ${libsDir}`);

// Figure out what tarball name npm will produce for each package
function expectedTarball(name, version) {
  // @scope/pkg → scope-pkg-version.tgz
  const clean = name.replace(/^@/, '').replace(/\//g, '-');
  return `${clean}-${version}.tgz`;
}

// Check which already exist in libs/
const existing = new Set(fs.readdirSync(libsDir).filter(f => f.endsWith('.tgz')));
const needed = [];
for (const [id, { name, version }] of topack) {
  const tarball = expectedTarball(name, version);
  if (existing.has(tarball)) {
    // already packed
  } else {
    needed.push({ name, version, tarball, id });
  }
}

console.log(`${existing.size} already in libs/, ${needed.length} to pack`);

// Pack in batches (parallel within batch)
const BATCH_SIZE = 20;
let packed = 0;
let failed = [];

for (let i = 0; i < needed.length; i += BATCH_SIZE) {
  const batch = needed.slice(i, i + BATCH_SIZE);
  const promises = batch.map(({ id }) => {
    try {
      execSync(`npm pack ${id} --pack-destination="${libsDir}" 2>/dev/null`, {
        cwd: appDir,
        stdio: 'pipe',
        timeout: 30000,
      });
      packed++;
    } catch (e) {
      failed.push(id);
    }
  });
  process.stdout.write(`\r  Packed ${packed}/${needed.length} (${failed.length} failed)`);
}

console.log(`\nDone: ${packed} packed, ${failed.length} failed`);
if (failed.length) {
  console.log('Failed packages:', failed.join(', '));
}

// Build the full map of name → tarball filename
const map = {};
for (const [id, { name, version }] of topack) {
  map[name] = `file:libs/${expectedTarball(name, version)}`;
}

// Write the map so we can use it to update package.json
const mapPath = path.join(appDir, 'libs', '_dep-map.json');
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
console.log(`Dependency map written to ${mapPath}`);
