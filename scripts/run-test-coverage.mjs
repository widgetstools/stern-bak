#!/usr/bin/env node
/**
 * run-test-coverage.mjs — run vitest with coverage across source/ and tarball/
 * app tracks, then merge package-level lcov.info files into coverage/lcov.info
 * for Sonar.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tracks = process.argv.includes('--tarball-only')
  ? ['tarball']
  : process.argv.includes('--source-only')
    ? ['source']
    : ['source', 'tarball'];

function discoverApps(trackRoot) {
  const apps = [];
  if (!existsSync(trackRoot)) return apps;
  for (const entry of readdirSync(trackRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const pkgPath = join(trackRoot, entry.name, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (!pkg.scripts?.test || /echo no tests/i.test(pkg.scripts.test)) continue;
    apps.push({ dir: entry.name, name: pkg.name ?? entry.name, root: join(trackRoot, entry.name) });
  }
  return apps.sort((a, b) => a.dir.localeCompare(b.dir));
}

function rewriteLcovPaths(lcov, appRoot) {
  const relRoot = relative(REPO_ROOT, appRoot).replace(/\\/g, '/');
  return lcov.replace(/^SF:(.+)$/gm, (_match, filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.startsWith(relRoot + '/')) return `SF:${normalized}`;
    if (normalized.startsWith('src/') || normalized.startsWith('scripts/')) {
      return `SF:${relRoot}/${normalized}`;
    }
    return `SF:${normalized}`;
  });
}

function mergeLcov(appRoots) {
  const chunks = [];
  for (const root of appRoots) {
    const lcovPath = join(root, 'coverage', 'lcov.info');
    if (!existsSync(lcovPath)) {
      process.stderr.write(`[coverage] missing ${lcovPath}\n`);
      continue;
    }
    chunks.push(rewriteLcovPaths(readFileSync(lcovPath, 'utf8'), root));
  }
  const outDir = join(REPO_ROOT, 'coverage');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'lcov.info'), chunks.join('\n'));
  process.stdout.write(`[coverage] merged ${chunks.length} lcov file(s) → coverage/lcov.info\n`);
}

const coverageArgs = [
  '--coverage',
  '--coverage.reportOnFailure',
  '--coverage.reporter=text',
  '--coverage.reporter=json-summary',
  '--coverage.reporter=lcov',
];

let failed = 0;
const testedRoots = [];

for (const track of tracks) {
  const trackRoot = join(REPO_ROOT, track);
  const apps = discoverApps(trackRoot);
  process.stdout.write(`[coverage] ${track} — ${apps.length} app(s)\n`);
  for (const app of apps) {
    process.stdout.write(`\n▶ ${app.name} (${track}/${app.dir})\n`);
  try {
    execSync(`${npmCmd} test -- ${coverageArgs.join(' ')}`, {
      cwd: app.root,
      stdio: 'inherit',
      env: { ...process.env },
    });
    testedRoots.push(app.root);
  } catch {
    failed++;
    process.stderr.write(`✗ ${app.name}\n`);
    const lcovPath = join(app.root, 'coverage', 'lcov.info');
    if (existsSync(lcovPath)) testedRoots.push(app.root);
  }
  }
}

mergeLcov(testedRoots);

if (failed > 0) {
  process.stderr.write(`\n[coverage] ${failed} app(s) failed\n`);
  process.exit(1);
}
