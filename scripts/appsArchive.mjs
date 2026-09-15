#!/usr/bin/env node
/**
 * appsArchive.mjs — carry the demo apps as an on-demand archive.
 *
 * `apps/` is demo/reference material: nine consumer apps plus the Playwright
 * suites. It is ~5.4 MB of source but changes rarely, and every CI job that
 * touched it paid a second full `npm install` for a tree nobody ships. So it
 * travels as `apps-demo.zip` instead, extracted only when someone actually
 * wants to run or edit a demo.
 *
 *   node scripts/appsArchive.mjs unpack   # get the demos back
 *   node scripts/appsArchive.mjs pack     # after changing them
 *   node scripts/appsArchive.mjs check    # did I forget to pack?
 *
 * Three things make that safe rather than a foot-gun:
 *
 * 1. **Packing is on demand, and guarded.** `pack` runs the apps' own per-file
 *    coverage gate first and refuses to write an archive whose demos are below
 *    the 70% bar. CI no longer enforces that bar, so the moment the archive is
 *    produced — the only moment the demos change — is where it is enforced
 *    instead. `--skip-gate` exists for a tree that cannot install.
 *
 * 2. **The archive is opaque; the manifest is not.** `apps-demo.manifest.txt`
 *    is written beside the zip and committed with it: one
 *    `<sha256>  <bytes>  <path>` line per file, sorted. A PR that changes the
 *    demos shows exactly which files moved and by how much, which is the part
 *    of review a binary blob would otherwise throw away.
 *
 * 3. **`check` catches a stale archive.** It compares the extracted tree to
 *    the manifest and exits non-zero on drift, so "I edited a demo and forgot
 *    to re-pack" is a command away rather than a silent loss. It is a no-op
 *    when `apps/` is not extracted.
 *
 * Nothing generated goes in: the skip list below mirrors `apps/.gitignore`,
 * and `pack` hard-fails if a `node_modules` path slips past it rather than
 * quietly shipping a 400 MB archive.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const APPS_DIR = join(REPO_ROOT, 'apps');
const ZIP_PATH = join(REPO_ROOT, 'apps-demo.zip');
const MANIFEST_PATH = join(REPO_ROOT, 'apps-demo.manifest.txt');
const IS_WINDOWS = process.platform === 'win32';

/**
 * Directories never archived. Mirrors `apps/.gitignore` — installed
 * dependencies, build output, coverage, Playwright artefacts, the vendored
 * tarballs `scripts/setup.mjs` copies in, and the `tarball/` track, which is
 * GENERATED from `source/` by `makeTarballApp.mjs`.
 */
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'coverage', '.turbo', '.vite', '.angular',
  'test-results', 'playwright-report', 'blob-report', 'vendor', 'tarball',
]);

/** Files never archived — lockfiles are deliberately not committed (CLAUDE.md). */
const SKIP_FILES = new Set(['package-lock.json', '.DS_Store']);
const SKIP_EXTENSIONS = ['.tsbuildinfo'];

const w = (msg) => process.stdout.write(`[apps-archive] ${msg}\n`);
const fail = (msg) => { process.stderr.write(`[apps-archive] ✗ ${msg}\n`); process.exit(1); };

// ── manifest ───────────────────────────────────────────────────────────────

/** Every archivable file under `apps/`, repo-relative with forward slashes. */
function listAppFiles(dir = APPS_DIR, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      listAppFiles(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      if (SKIP_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      out.push(relative(REPO_ROOT, join(dir, entry.name)).split(sep).join('/'));
    }
  }
  return out;
}

function manifestFor(files) {
  const lines = files.map((file) => {
    const abs = join(REPO_ROOT, file);
    const hash = createHash('sha256').update(readFileSync(abs)).digest('hex');
    return `${hash}  ${String(statSync(abs).size).padStart(9)}  ${file}`;
  });
  const bytes = files.reduce((sum, f) => sum + statSync(join(REPO_ROOT, f)).size, 0);
  return [
    '# apps-demo.zip contents — regenerate with `npm run apps:pack`.',
    '# One line per archived file: <sha256>  <bytes>  <path>.',
    `# ${files.length} files, ${bytes} bytes.`,
    ...lines,
    '',
  ].join('\n');
}

/** Parsed manifest as path → sha256, ignoring comments. */
function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return null;
  const byPath = new Map();
  for (const line of readFileSync(MANIFEST_PATH, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const match = /^([0-9a-f]{64})\s+\d+\s+(.+)$/.exec(line);
    if (match) byPath.set(match[2], match[1]);
  }
  return byPath;
}

// ── zip / unzip ────────────────────────────────────────────────────────────

/**
 * Shells out rather than taking an archiver dependency: Node ships no zip
 * writer, and a build-tooling dep that exists only to package demo material
 * is worse than two code paths. `zip`/`unzip` are on macOS and every CI image;
 * Windows has neither, so PowerShell's built-ins stand in there.
 */
function runZip(files) {
  if (IS_WINDOWS) {
    // Compress-Archive takes the paths on stdin-free argument lists badly at
    // this count, so it archives the directory and the skip list is applied by
    // staging instead — see packWindows below.
    return packWindows(files);
  }
  const listFile = join(REPO_ROOT, '.apps-archive-filelist');
  writeFileSync(listFile, `${files.join('\n')}\n`, 'utf8');
  try {
    // -X drops extra file attributes (uid/gid, mtime precision) so the same
    // tree packs to the same bytes on a different machine.
    execFileSync('zip', ['-q', '-X', '-9', ZIP_PATH, '-@'], {
      cwd: REPO_ROOT,
      input: readFileSync(listFile),
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } finally {
    rmSync(listFile, { force: true });
  }
}

function packWindows(files) {
  const staging = join(REPO_ROOT, '.apps-archive-staging');
  rmSync(staging, { recursive: true, force: true });
  for (const file of files) {
    const dest = join(staging, file);
    mkdirSync(join(dest, '..'), { recursive: true });
    writeFileSync(dest, readFileSync(join(REPO_ROOT, file)));
  }
  try {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Compress-Archive -Path '${join(staging, 'apps')}' -DestinationPath '${ZIP_PATH}' -Force`,
    ], { stdio: 'inherit' });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function runUnzip() {
  if (IS_WINDOWS) {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${REPO_ROOT}' -Force`,
    ], { stdio: 'inherit' });
    return;
  }
  execFileSync('unzip', ['-q', '-o', ZIP_PATH], { cwd: REPO_ROOT, stdio: 'inherit' });
}

// ── commands ───────────────────────────────────────────────────────────────

function pack({ skipGate }) {
  if (!existsSync(APPS_DIR)) fail('apps/ is not extracted — nothing to pack. Run `npm run apps:unpack` first.');

  if (skipGate) {
    w('⚠ skipping the apps coverage gate (--skip-gate).');
  } else {
    w('running the apps per-file coverage gate before packing…');
    try {
      execFileSync('npm', ['run', 'test:coverage:check'], { cwd: APPS_DIR, stdio: 'inherit' });
    } catch {
      fail(
        'the demos are below the 70% per-file bar, so the archive was not written.\n'
        + '  CI no longer runs this gate, so packing is where it is enforced.\n'
        + '  Fix the coverage, or pass --skip-gate if you cannot install here.',
      );
    }
  }

  const files = listAppFiles();
  if (files.length === 0) fail('found no archivable files under apps/.');

  const leaked = files.filter((f) => f.split('/').some((seg) => SKIP_DIRS.has(seg)));
  if (leaked.length > 0) {
    fail(`${leaked.length} generated path(s) escaped the skip list, e.g. ${leaked[0]}`);
  }

  rmSync(ZIP_PATH, { force: true });
  runZip(files);
  writeFileSync(MANIFEST_PATH, manifestFor(files), 'utf8');

  const zipped = statSync(ZIP_PATH).size;
  const raw = files.reduce((sum, f) => sum + statSync(join(REPO_ROOT, f)).size, 0);
  w(`packed ${files.length} files — ${(raw / 1e6).toFixed(1)} MB → ${(zipped / 1e6).toFixed(1)} MB`);
  w(`wrote ${relative(REPO_ROOT, ZIP_PATH)} and ${relative(REPO_ROOT, MANIFEST_PATH)} — commit both.`);
}

function unpack({ force }) {
  if (!existsSync(ZIP_PATH)) fail(`${relative(REPO_ROOT, ZIP_PATH)} is missing.`);
  if (existsSync(APPS_DIR) && !force) {
    // Extracting over a tree with local edits would silently revert them, and
    // the edits are not in git to recover from.
    fail('apps/ already exists. Re-extracting would overwrite local demo edits.\n'
      + '  Pass --force to overwrite, or move apps/ aside first.');
  }
  runUnzip();
  const files = listAppFiles();
  w(`extracted ${files.length} files into apps/`);
  w('next: `cd apps && npm install` (its own install root — see docs/APPS_REPO.md)');
}

function check() {
  const manifest = readManifest();
  if (!manifest) fail(`${relative(REPO_ROOT, MANIFEST_PATH)} is missing — run \`npm run apps:pack\`.`);
  if (!existsSync(APPS_DIR)) {
    w('apps/ is not extracted — nothing to compare.');
    return;
  }

  const onDisk = new Map();
  for (const file of listAppFiles()) {
    onDisk.set(file, createHash('sha256').update(readFileSync(join(REPO_ROOT, file))).digest('hex'));
  }

  const added = [...onDisk.keys()].filter((f) => !manifest.has(f));
  const removed = [...manifest.keys()].filter((f) => !onDisk.has(f));
  const changed = [...onDisk].filter(([f, h]) => manifest.has(f) && manifest.get(f) !== h).map(([f]) => f);
  const drift = added.length + removed.length + changed.length;

  if (drift === 0) {
    w(`in sync — ${onDisk.size} files match ${relative(REPO_ROOT, MANIFEST_PATH)}`);
    return;
  }

  process.stderr.write(`[apps-archive] ✗ apps/ has drifted from the archive (${drift} file(s)):\n`);
  for (const [label, list] of [['added', added], ['removed', removed], ['changed', changed]]) {
    for (const file of list.slice(0, 10)) process.stderr.write(`    ${label.padEnd(8)} ${file}\n`);
    if (list.length > 10) process.stderr.write(`    … and ${list.length - 10} more ${label}\n`);
  }
  process.stderr.write('  Run `npm run apps:pack` and commit the zip + manifest.\n');
  process.exit(1);
}

// ── entry ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const command = argv[0];
const opts = { skipGate: argv.includes('--skip-gate'), force: argv.includes('--force') };

if (command === 'pack') pack(opts);
else if (command === 'unpack') unpack(opts);
else if (command === 'check') check();
else {
  process.stderr.write('usage: node scripts/appsArchive.mjs <pack|unpack|check> [--force] [--skip-gate]\n');
  process.exit(1);
}
