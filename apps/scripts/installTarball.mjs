#!/usr/bin/env node
/**
 * installTarball.mjs — `npm install` each app in the tarball track.
 *
 * They are not npm workspaces (npm resolves the workspace tree before any root
 * lifecycle script, so a workspace member cannot depend on files `setup.mjs`
 * produces), so each installs into its own node_modules. That isolation is also
 * the point: an external consumer has no hoisted parent to borrow from.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './resolvePlatform.mjs';

const TARBALL_ROOT = join(REPO_ROOT, 'tarball');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!existsSync(TARBALL_ROOT)) {
  process.stderr.write(`[install-tarball] missing ${TARBALL_ROOT}\n`);
  process.exit(1);
}

const apps = readdirSync(TARBALL_ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(TARBALL_ROOT, e.name, 'package.json')))
  .map((e) => e.name)
  .sort();

if (apps.length === 0) {
  process.stderr.write('[install-tarball] no apps under tarball/ — run scripts/makeTarballApp.mjs --all\n');
  process.exit(1);
}

let failed = 0;
for (const app of apps) {
  process.stdout.write(`\n[install-tarball] ▶ ${app}\n`);
  try {
    execFileSync(npmCmd, ['install', '--no-audit', '--no-fund'], {
      cwd: join(TARBALL_ROOT, app),
      stdio: 'inherit',
      // shell:true is required on Windows for the .cmd shim.
      shell: process.platform === 'win32',
    });
  } catch {
    failed += 1;
    process.stderr.write(`[install-tarball] ✗ ${app}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`\n[install-tarball] ${failed}/${apps.length} failed\n`);
  process.exit(1);
}
process.stdout.write(`\n[install-tarball] OK — ${apps.length} app(s)\n`);
