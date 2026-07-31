#!/usr/bin/env node
/**
 * Build or typecheck every app under apps/demos/ from source — Vite aliases
 * @wellsfargo-starui/* to packages/ source (see scripts/staruiConsumerAliases.mjs). Apps
 * no longer depend on libs/*.tgz tarballs; the tarballs are packed by
 * `npm run propagate` for external (Artifactory) consumers only.
 *
 *   node scripts/build-app-track.mjs build
 *   node scripts/build-app-track.mjs typecheck
 *
 * Runs each app's script from its own directory (avoids npm workspace-name
 * collisions and keeps cwd-relative config correct).
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const APPS_ROOT = join(REPO_ROOT, 'apps', 'demos');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const task = process.argv[2] ?? 'build';

if (task !== 'build' && task !== 'typecheck') {
  process.stderr.write('Usage: node scripts/build-app-track.mjs [build|typecheck]\n');
  process.exit(1);
}
if (!existsSync(APPS_ROOT)) {
  process.stderr.write(`Missing ${APPS_ROOT}\n`);
  process.exit(1);
}

/** Angular apps are excluded — the build pipeline targets React + shared only. */
function isAngularApp(pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Boolean(deps['@angular/core']);
}

/** @type {{ dir: string, name: string }[]} */
const apps = [];
for (const entry of readdirSync(APPS_ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'node_modules') continue;
  const pkgPath = join(APPS_ROOT, entry.name, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts?.[task]) continue;
  if (isAngularApp(pkg)) continue;
  apps.push({ dir: entry.name, name: pkg.name ?? entry.name });
}
apps.sort((a, b) => a.dir.localeCompare(b.dir));

if (apps.length === 0) {
  process.stderr.write(`No apps with "${task}" under apps/demos/\n`);
  process.exit(1);
}

process.stdout.write(`[build-app-track] source ${task} — ${apps.length} app(s) in apps/demos/\n`);

let failed = 0;
for (const { dir, name } of apps) {
  const appDir = join(APPS_ROOT, dir);
  process.stdout.write(`\n▶ ${name} (apps/demos/${dir}) → npm run ${task}\n`);
  try {
    execSync(`${npmCmd} run ${task}`, { cwd: appDir, stdio: 'inherit' });
  } catch {
    failed++;
    process.stderr.write(`✗ ${name}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`\n[build-app-track] ${failed}/${apps.length} failed\n`);
  process.exit(1);
}
process.stdout.write(`\n[build-app-track] source ${task} OK — ${apps.length} app(s)\n`);
