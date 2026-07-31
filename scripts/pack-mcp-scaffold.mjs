#!/usr/bin/env node
/**
 * pack-mcp-scaffold.mjs — build @wellsfargo-starui/mcp-scaffold and emit libs/starui-mcp-scaffold-*.tgz
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MCP_DIR = join(REPO_ROOT, 'tools', 'mcp-scaffold');
const LIBS_DIR = join(REPO_ROOT, 'libs');
const BUNDLED = join(MCP_DIR, 'bundled-libs');

const dryRun = process.argv.includes('--dry-run');
const skipPropagate = process.argv.includes('--skip-propagate');

function log(msg) {
  console.log(`[pack:mcp] ${msg}`);
}

function gitSha8() {
  try {
    return execSync('git rev-parse --short=8 HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

if (!skipPropagate && !dryRun) {
  log('running propagate…');
  execSync('npm run propagate -- --skip-drift-check', { cwd: REPO_ROOT, stdio: 'inherit' });
}

if (!dryRun) {
  mkdirSync(BUNDLED, { recursive: true });
  for (const file of readdirSync(LIBS_DIR)) {
    if (file.endsWith('.tgz') || file === 'manifest.json') {
      cpSync(join(LIBS_DIR, file), join(BUNDLED, file));
    }
  }
  log(`copied tarballs to ${BUNDLED}`);
  execSync('npm run build --workspace=@wellsfargo-starui/mcp-scaffold', { cwd: REPO_ROOT, stdio: 'inherit' });
  const pkg = JSON.parse(readFileSync(join(MCP_DIR, 'package.json'), 'utf8'));
  execSync('npm pack', { cwd: MCP_DIR, stdio: 'inherit' });
  const packed = readdirSync(MCP_DIR).find((f) => f.endsWith('.tgz') && f.startsWith('starui-mcp-scaffold'));
  if (!packed) throw new Error('npm pack did not produce tarball');
  const dest = join(LIBS_DIR, `starui-mcp-scaffold-${pkg.version}-${gitSha8()}.tgz`);
  cpSync(join(MCP_DIR, packed), dest);
  rmSync(join(MCP_DIR, packed));
  log(`wrote ${dest}`);
} else {
  log('dry-run — no files written');
}
