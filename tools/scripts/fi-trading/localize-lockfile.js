#!/usr/bin/env node
/**
 * Rewrite package-lock.json so every "resolved" field points to a local
 * tarball in libs/ instead of the npm registry.
 *
 * Usage: node scripts/localize-lockfile.js <app-dir>
 */
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(process.argv[2] || '.');
const lockPath = path.join(appDir, 'package-lock.json');
const libsDir = path.join(appDir, 'libs');

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const libsFiles = new Set(fs.readdirSync(libsDir).filter(f => f.endsWith('.tgz')));

function expectedTarball(name, version) {
  const clean = name.replace(/^@/, '').replace(/\//g, '-');
  return `${clean}-${version}.tgz`;
}

let rewritten = 0;
let missing = 0;

for (const [key, info] of Object.entries(lock.packages || {})) {
  if (!key || key === '') continue;

  const parts = key.replace(/^node_modules\//, '').split('node_modules/');
  const name = parts[parts.length - 1];
  const version = info.version;
  if (!name || !version) continue;

  // Already a file: reference — skip
  if (info.resolved && info.resolved.startsWith('file:libs/')) continue;

  const tarball = expectedTarball(name, version);
  if (libsFiles.has(tarball)) {
    info.resolved = `file:libs/${tarball}`;
    // Remove integrity hash since file: references don't need it
    // and it may mismatch the local tarball
    delete info.integrity;
    rewritten++;
  } else {
    missing++;
  }
}

fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(`Localized ${lockPath}: ${rewritten} rewritten, ${missing} missing tarballs (kept as-is)`);
