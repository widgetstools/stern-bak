#!/usr/bin/env node
/**
 * ensure-workspace-links.mjs — restore missing workspace symlinks before turbo build.
 *
 * propagate.mjs refreshes app tarballs by deleting hoisted @wellsfargo-starui/* copies under
 * apps/ (and historically the repo root). If root workspace links are removed,
 * `npm run build:packages` fails with TS2307 for @wellsfargo-starui/design-system until a
 * manual root `npm install`. This script detects missing foundation links and
 * runs a root install once.
 */
import { execSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');

/** Workspace packages every package build expects hoisted at root. */
const REQUIRED_WORKSPACE_PACKAGES = [
  '@wellsfargo-starui/design-system',
  '@wellsfargo-starui/types',
  '@wellsfargo-starui/host-config',
  '@wellsfargo-starui/react',
  '@wellsfargo-starui/grid',
];

function workspaceLinkPath(packageName) {
  const short = packageName.split('/')[1];
  return join(REPO_ROOT, 'node_modules', '@wellsfargo-starui', short);
}

function isRepoWorkspaceSymlink(path) {
  if (!existsSync(path)) return false;
  try {
    const resolved = realpathSync(path);
    const packagesRoot = realpathSync(PACKAGES_ROOT);
    return resolved.startsWith(packagesRoot);
  } catch {
    return false;
  }
}

function missingPackages() {
  return REQUIRED_WORKSPACE_PACKAGES.filter((name) => !isRepoWorkspaceSymlink(workspaceLinkPath(name)));
}

const missing = missingPackages();
if (missing.length === 0) {
  process.stdout.write('[ensure-workspace-links] all foundation workspace links present\n');
  process.exit(0);
}

process.stdout.write(
  `[ensure-workspace-links] missing workspace links: ${missing.join(', ')} — running npm install at repo root\n`,
);
execSync('npm install --no-audit --no-fund', { cwd: REPO_ROOT, stdio: 'inherit' });

const stillMissing = missingPackages();
if (stillMissing.length > 0) {
  process.stderr.write(
    `[ensure-workspace-links] ERROR: still missing after npm install: ${stillMissing.join(', ')}\n`,
  );
  process.exit(1);
}

process.stdout.write('[ensure-workspace-links] workspace links restored\n');
