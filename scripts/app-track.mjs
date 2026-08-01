#!/usr/bin/env node
/**
 * app-track.mjs — build or typecheck every app in one consumption track.
 *
 *   node scripts/app-track.mjs build source
 *   node scripts/app-track.mjs typecheck tarball
 *
 * Two tracks live side by side:
 *
 *   source/   resolves @wellsfargo-starui/* out of the platform checkout named
 *             by the `@wellsfargo-starui/platform` file: dependency. Vite gets
 *             absolute paths from that repo's staruiConsumerAliases.mjs; tsc
 *             gets them from its generated tsconfig.consumer.json.
 *
 *   tarball/  installs the packed bucket tarballs instead, exercising the same
 *             resolution path an external Artifactory consumer takes.
 *             STARUI_USE_TARBALLS=1 switches the alias module over.
 *
 * Each app runs from its own directory so cwd-relative config stays correct.
 *
 * Derived from the platform repo's former scripts/build-app-track.mjs, which
 * walked apps/demos/ back when the apps lived inside that repo.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const task = process.argv[2] ?? 'build';
const track = process.argv[3] ?? 'source';

if (task !== 'build' && task !== 'typecheck' && task !== 'test') {
  process.stderr.write('Usage: node scripts/app-track.mjs [build|typecheck|test] [source|tarball]\n');
  process.exit(1);
}
if (track !== 'source' && track !== 'tarball') {
  process.stderr.write('Usage: node scripts/app-track.mjs [build|typecheck] [source|tarball]\n');
  process.exit(1);
}

const trackRoot = join(REPO_ROOT, track);
if (!existsSync(trackRoot)) {
  process.stderr.write(`Missing ${trackRoot}\n`);
  process.exit(1);
}

const apps = [];
for (const entry of readdirSync(trackRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'node_modules') continue;
  const pkgPath = join(trackRoot, entry.name, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts?.[task]) continue;
  apps.push({ dir: entry.name, name: pkg.name ?? entry.name });
}
apps.sort((a, b) => a.dir.localeCompare(b.dir));

if (apps.length === 0) {
  process.stderr.write(`No apps with "${task}" under ${track}/\n`);
  process.exit(1);
}

process.stdout.write(`[app-track] ${track} ${task} — ${apps.length} app(s)\n`);

// No env switch is needed: the two tracks differ by CONFIG, not by a flag.
// source/ apps import the platform's Vite helper; tarball/ apps use a plain
// Vite config and resolve from their own node_modules. (An earlier
// STARUI_USE_TARBALLS flag selected a bucket-tarball resolution mode in the
// alias layer; bucket tarballs no longer exist.)
const env = { ...process.env };

let failed = 0;
for (const { dir, name } of apps) {
  process.stdout.write(`\n▶ ${name} (${track}/${dir}) → npm run ${task}\n`);
  try {
    execSync(`${npmCmd} run ${task}`, { cwd: join(trackRoot, dir), stdio: 'inherit', env });
  } catch {
    failed++;
    process.stderr.write(`✗ ${name}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`\n[app-track] ${failed}/${apps.length} failed in ${track}/\n`);
  process.exit(1);
}
process.stdout.write(`\n[app-track] ${track} ${task} OK — ${apps.length} app(s)\n`);
