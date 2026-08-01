#!/usr/bin/env node
/**
 * verify-external-consumers.mjs — scripted external-consumer gate for the
 * `pack:npm` tarballs (package-collapse sub-phase 7, spec section 5).
 *
 * Why: sub-phase 6 verified the collapsed packages by hand — a scratch
 * consumer outside the workspace installed all 7 tarballs, probed every
 * export subpath, every retired pre-collapse package name, and the two
 * peer-isolation closures. That transcript lives only in the worklog; this
 * script turns it into a repeatable gate (`npm run verify:external`).
 *
 * What it asserts — everything against the packed tarballs, never workspace
 * source, so it exercises exactly what an Artifactory consumer would get:
 *
 *   1. Every key of every package's `exports` map resolves via
 *      `import.meta.resolve()` from a temp consumer that installed all
 *      tarballs. The subpath list is derived from the tarball manifests
 *      (never hardcoded), so a new subpath is covered the day it ships, and
 *      each resolved `file:` URL must exist on disk — `import.meta.resolve`
 *      alone does not check existence, so this also catches a dist file the
 *      bucket `files` list forgot to ship. Wildcard keys (`./icons/svg/*`)
 *      are probed with a real file found in the installed package.
 *      `require.resolve` is deliberately not used: several `.` entries are
 *      import-only by design (data, openfin, design-system, the types
 *      host-side subpaths), which `require` reports as
 *      ERR_PACKAGE_PATH_NOT_EXPORTED.
 *   2. Every retired pre-collapse package name fails to resolve with
 *      ERR_MODULE_NOT_FOUND — a stale retired-name tarball sneaking back
 *      into an install would surface here.
 *   3. Peer isolation: a data-only consumer (data + its transitive
 *      @wellsfargo-starui closure, computed from the tarball manifests) must not
 *      pull `react`; a react-only consumer must not pull
 *      `ag-grid-enterprise`.
 *
 * Temp consumers live under os.tmpdir(): removed on success, path printed
 * on failure so the wreckage can be inspected. Any failed assertion exits
 * non-zero with a named-assertion report.
 *
 * Usage:
 *   node scripts/verify-external-consumers.mjs            # fresh full pack:npm first
 *   node scripts/verify-external-consumers.mjs --no-pack  # reuse existing dist-npm/
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_NPM = path.join(REPO_ROOT, 'dist-npm');
const SCOPE = '@wellsfargo-starui/';
const NO_PACK = process.argv.includes('--no-pack');

// Pre-collapse identities (spec section 5). These must all fail to resolve
// from a consumer that installed the collapsed tarballs — each now lives on
// only as an export subpath of its bucket package.
const RETIRED_NAMES = [
  'engine', 'host', 'host-browser', 'host-config', 'widget', 'widget-browser',
  'shared-types', 'ui', 'widget-sdk', 'host-wrapper-react',
  'workspace-setup-react', 'host-data-react', 'host-data', 'host-openfin',
  'openfin-platform', 'config-browser', 'widgets-react', 'icons-svg',
].map((short) => `${SCOPE}${short}`);

const log = (m) => console.log(`[verify-external] ${m}`);
const checks = [];
const pass = (name) => checks.push({ name, ok: true });
const fail = (name, detail) => checks.push({ name, ok: false, detail });

function npmIn(cwd, args) {
  try {
    const output = execFileSync('npm', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    return { ok: true, output };
  } catch (err) {
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}`.trim() || String(err) };
  }
}

/** package/package.json out of a packed tarball, without extracting it. */
function readTarballPkg(tgzPath) {
  const raw = execFileSync('tar', ['-xOf', tgzPath, 'package/package.json'], {
    encoding: 'utf8',
  });
  return JSON.parse(raw);
}

/** Subpath keys of an exports map ('.'-keyed form; bare/conditional → ['.']). */
function exportKeys(exports_) {
  if (exports_ == null || typeof exports_ === 'string') return ['.'];
  const keys = Object.keys(exports_);
  return keys.some((k) => k.startsWith('.')) ? keys : ['.'];
}

/** First concrete target path inside an exports value (string | array | conditions). */
function pickTarget(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const v of value) {
      const t = pickTarget(v);
      if (t) return t;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const cond of ['import', 'default', 'require', 'types', ...Object.keys(value)]) {
      if (cond in value) {
        const t = pickTarget(value[cond]);
        if (t) return t;
      }
    }
  }
  return null;
}

/** All files under dir as './'-prefixed posix-relative paths (skips node_modules). */
function walkFiles(dir, base = dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name !== 'node_modules') walkFiles(p, base, acc);
    } else {
      acc.push(`./${path.relative(base, p).split(path.sep).join('/')}`);
    }
  }
  return acc;
}

/**
 * Turn a wildcard export key ('./icons/svg/*') into a concrete specifier by
 * finding a real packed file that its target pattern matches. Returns null
 * (and records a failure) when nothing in the install matches — an
 * exports entry pointing at nothing is a packaging bug, not a skip.
 */
function concreteWildcardSpecifier(pkgName, key, target, consumerDir) {
  const name = `exports ${pkgName} "${key}"`;
  if (!target || !target.includes('*')) {
    fail(name, `wildcard key with non-wildcard target ${JSON.stringify(target)}`);
    return null;
  }
  const [pre, suf = ''] = target.split('*');
  const pkgDir = path.join(consumerDir, 'node_modules', pkgName);
  const match = walkFiles(pkgDir).find(
    (rel) => rel.startsWith(pre) && rel.endsWith(suf) && rel.length > pre.length + suf.length,
  );
  if (!match) {
    fail(name, `no packed file matches target pattern ${target}`);
    return null;
  }
  const star = match.slice(pre.length, match.length - suf.length);
  return `${pkgName}${key.replace('*', star).slice(1)}`;
}

/** Transitive @wellsfargo-starui/* dep closure of one package, from tarball manifests. */
function scopeClosure(rootName, pkgByName) {
  const seen = new Set([rootName]);
  const stack = [rootName];
  while (stack.length > 0) {
    const pkg = pkgByName.get(stack.pop());
    const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
    for (const dep of Object.keys(deps)) {
      if (dep.startsWith(SCOPE) && pkgByName.has(dep) && !seen.has(dep)) {
        seen.add(dep);
        stack.push(dep);
      }
    }
  }
  return [...seen].sort();
}

function makeConsumer(tempRoot, label, tarballPaths) {
  const dir = path.join(tempRoot, label);
  mkdirSync(dir, { recursive: true });
  const init = npmIn(dir, ['init', '-y']);
  if (!init.ok) {
    fail(`install ${label}`, `npm init -y failed: ${init.output}`);
    return null;
  }
  log(`${label}: installing ${tarballPaths.length} tarball(s)…`);
  const install = npmIn(dir, [
    'install', '--no-audit', '--no-fund', '--loglevel=error', ...tarballPaths,
  ]);
  if (!install.ok) {
    fail(`install ${label}`, `npm install failed: ${install.output}`);
    return null;
  }
  pass(`install ${label}`);
  return dir;
}

// Runs inside the temp consumer so bare specifiers resolve against ITS
// node_modules, exactly as consumer code would. Cases arrive via env.
const CHILD_SOURCE = `
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = [];
for (const c of JSON.parse(process.env.STARUI_VERIFY_CASES)) {
  let url = null;
  let code = null;
  try { url = import.meta.resolve(c.specifier); }
  catch (err) { code = err?.code ?? String(err); }
  if (c.expect === 'resolves') {
    if (url === null) out.push({ name: c.name, ok: false, detail: 'did not resolve: ' + code });
    else if (url.startsWith('file:') && !existsSync(fileURLToPath(url)))
      out.push({ name: c.name, ok: false, detail: 'resolved to missing file ' + url });
    else out.push({ name: c.name, ok: true });
  } else if (url !== null) {
    out.push({ name: c.name, ok: false, detail: 'unexpectedly resolved to ' + url });
  } else if (code !== c.expect) {
    out.push({ name: c.name, ok: false, detail: 'failed with ' + code + ', expected ' + c.expect });
  } else {
    out.push({ name: c.name, ok: true });
  }
}
process.stdout.write(JSON.stringify(out));
`;

function runResolveCases(consumerDir, cases) {
  try {
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', CHILD_SOURCE], {
      cwd: consumerDir,
      encoding: 'utf8',
      env: { ...process.env, STARUI_VERIFY_CASES: JSON.stringify(cases) },
    });
    checks.push(...JSON.parse(stdout));
  } catch (err) {
    fail('resolve child process', `${err.stderr ?? err}`.trim());
  }
}

function report(tempRoot) {
  const failed = checks.filter((c) => !c.ok);
  log(`${checks.length - failed.length} assertion(s) passed, ${failed.length} failed`);
  if (failed.length === 0) {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    log('external-consumer gate green');
    return;
  }
  for (const c of failed) console.error(`  ✗ ${c.name} — ${c.detail}`);
  if (tempRoot) log(`temp consumers kept for inspection: ${tempRoot}`);
  process.exit(1);
}

function main() {
  if (!NO_PACK) {
    log('running a fresh full pack (node scripts/pack-npm.mjs)…');
    execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'pack-npm.mjs')], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  }

  // Pre-flight: the manifest is the record of the pack run; every tarball it
  // lists must be present before anything is installed from it.
  const manifestPath = path.join(DIST_NPM, 'manifest.json');
  if (!existsSync(manifestPath)) {
    fail('dist-npm manifest present', `${manifestPath} missing — run pack:npm (or drop --no-pack)`);
    report(null);
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')).packages ?? [];
  if (manifest.length === 0) fail('manifest lists packages', 'manifest.json has an empty packages list');
  else pass('manifest lists packages');
  const entries = [];
  for (const { name, file } of manifest) {
    const tgz = path.join(DIST_NPM, file);
    if (!existsSync(tgz)) {
      fail(`tarball present ${name}`, `${file} listed in manifest but missing from dist-npm/`);
      continue;
    }
    pass(`tarball present ${name}`);
    entries.push({ name, tgz, pkg: readTarballPkg(tgz) });
  }
  if (checks.some((c) => !c.ok)) {
    report(null);
    return;
  }

  const pkgByName = new Map(entries.map((e) => [e.name, e.pkg]));
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'starui-verify-external-'));
  log(`temp root: ${tempRoot}`);

  // 1+2 — full consumer: every export key resolves, every retired name fails.
  const allDir = makeConsumer(tempRoot, 'consumer-all', entries.map((e) => e.tgz));
  if (allDir) {
    const cases = [];
    for (const { name, pkg } of entries) {
      for (const key of exportKeys(pkg.exports)) {
        const specifier = key.includes('*')
          ? concreteWildcardSpecifier(name, key, pickTarget(pkg.exports[key]), allDir)
          : (key === '.' ? name : `${name}${key.slice(1)}`);
        if (specifier) {
          cases.push({ name: `exports ${name} "${key}"`, specifier, expect: 'resolves' });
        }
      }
    }
    for (const retired of RETIRED_NAMES) {
      cases.push({ name: `retired ${retired}`, specifier: retired, expect: 'ERR_MODULE_NOT_FOUND' });
    }
    log(`consumer-all: probing ${cases.length} specifier(s) `
      + `(${cases.length - RETIRED_NAMES.length} export keys across ${entries.length} packages, `
      + `${RETIRED_NAMES.length} retired names)`);
    runResolveCases(allDir, cases);
  }

  // 3 — peer isolation, dep closures computed from the tarball manifests.
  const isolations = [
    { label: 'consumer-data-only', root: `${SCOPE}data`, forbidden: 'react' },
    { label: 'consumer-react-only', root: `${SCOPE}react`, forbidden: 'ag-grid-enterprise' },
  ];
  for (const { label, root, forbidden } of isolations) {
    const name = `peer isolation ${label}: ${forbidden} absent`;
    if (!pkgByName.has(root)) {
      fail(name, `${root} not in the packed manifest`);
      continue;
    }
    const closure = scopeClosure(root, pkgByName);
    log(`${label}: closure of ${root} = ${closure.map((n) => n.slice(SCOPE.length)).join(', ')}`);
    const dir = makeConsumer(
      tempRoot, label,
      closure.map((n) => entries.find((e) => e.name === n).tgz),
    );
    if (!dir) continue;
    if (existsSync(path.join(dir, 'node_modules', forbidden))) {
      fail(name, `${forbidden} was installed into ${label}/node_modules`);
    } else {
      pass(name);
    }
  }

  report(tempRoot);
}

main();
