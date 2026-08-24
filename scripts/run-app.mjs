#!/usr/bin/env node
/**
 * run-app.mjs — run any demo app (source or tarball track) from the repo root.
 *
 *   npm run app -- <app> [--tarball] [--openfin] [--broker] [--no-broker]
 *   npm run app                 # usage + app table
 *
 * Smart bits:
 *   - Apps that need the STOMP fixture broker get `stomp-view-server`
 *     started automatically (skipped when something already listens on its
 *     port). `stomp-marketsgrid-minimal` requires it; `star-demo` seeds
 *     STOMP provider configs so it starts it too unless --no-broker.
 *     Any app can opt in with --broker.
 *   - `--openfin` (star-demo) starts the Vite dev server, waits for it to
 *     answer, then runs the app's own OpenFin launcher (`npm run client`,
 *     whose manifest URL is already correct per track).
 *   - `--tarball` runs the generated twin under apps/tarball/ (port +1000)
 *     and explains the bootstrap commands if the twin isn't installed yet.
 *
 * The broker always runs from apps/source (it deliberately has no tarball
 * twin). Ctrl+C shuts down everything this script started.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IS_WIN = process.platform === 'win32';
// On Windows, npm resolves to npm.cmd — a batch file. Node (since the
// GHSA-3v29-jf9x-... .cmd/.bat hardening fix) refuses to spawn a .cmd
// directly without `shell: true`, so this always spawns plain `npm` and
// lets `shell: IS_WIN` (see run()) hand it to cmd.exe for resolution.
const NPM_CMD = 'npm';

/** broker: 'required' | 'auto' (on unless --no-broker) | 'none' (on with --broker) */
const APPS = {
  'basic':                     { port: 5194, broker: 'none' },
  'dataprovider-editor':       { port: 5193, broker: 'none' },
  'design-system':             { port: 5310, broker: 'none' },
  'markets-grid-lab':          { port: 5300, broker: 'none' },
  'star-demo':                 { port: 5175, broker: 'auto', openfin: true },
  'stomp-marketsgrid-minimal': { port: 5213, broker: 'required' },
  'stomp-view-server':         { port: 8081, broker: 'self' },
};
const BROKER = 'stomp-view-server';
const BROKER_PORT = APPS[BROKER].port;
const TARBALL_PORT_OFFSET = 1000;

// ─── args ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const name = argv.find((a) => !a.startsWith('--'));
const track = flags.has('--tarball') ? 'tarball' : 'source';

function usage(code) {
  const rows = Object.entries(APPS).map(([n, a]) => {
    const notes = [
      a.broker === 'required' ? 'starts broker' : a.broker === 'auto' ? 'starts broker (skip: --no-broker)' : '',
      a.openfin ? 'supports --openfin' : '',
      n === BROKER ? 'the broker itself (source only)' : '',
    ].filter(Boolean).join('; ');
    const ports = n === BROKER ? `:${a.port} (no tarball twin)` : `:${a.port} (tarball :${a.port + TARBALL_PORT_OFFSET})`;
    return `  ${n.padEnd(27)} ${ports}  ${notes}`;
  });
  console.log(`Usage: npm run app -- <app> [--tarball] [--openfin] [--broker] [--no-broker]\n\nApps:\n${rows.join('\n')}\n\nExamples:\n  npm run app -- basic\n  npm run app -- stomp-marketsgrid-minimal        # broker starts automatically\n  npm run app -- star-demo --openfin              # dev server, then OpenFin launcher\n  npm run app -- markets-grid-lab --tarball       # generated twin on :6300`);
  process.exit(code);
}

if (!name) usage(0);
if (!APPS[name]) {
  console.error(`Unknown app "${name}".`);
  usage(1);
}
const app = APPS[name];
if (flags.has('--openfin') && !app.openfin) {
  console.error(`--openfin is only supported by: ${Object.keys(APPS).filter((n) => APPS[n].openfin).join(', ')}`);
  process.exit(1);
}
if (name === BROKER && track === 'tarball') {
  console.error(`${BROKER} has no tarball twin by design (it imports no @wellsfargo-starui packages).`);
  process.exit(1);
}

const appDir = join(REPO, 'apps', track, name);
const appPort = app.port + (track === 'tarball' ? TARBALL_PORT_OFFSET : 0);

if (!existsSync(join(appDir, 'package.json'))) {
  console.error(`${appDir} does not exist.`);
  if (track === 'tarball') {
    console.error(
      `The tarball twins are generated. Bootstrap everything with:\n` +
      `  npm run setup:apps\n` +
      `Or manually:\n` +
      `  npm run pack:npm && cd apps && npm install && npm run setup:tarball`,
    );
  }
  process.exit(1);
}
if (track === 'tarball' && !existsSync(join(appDir, 'node_modules'))) {
  console.error(`${appDir} is not installed. Run:  cd apps && npm run setup:tarball`);
  process.exit(1);
}

// ─── helpers ───────────────────────────────────────────────────────
function portInUse(port) {
  return new Promise((done) => {
    const sock = connect({ port, host: '127.0.0.1' });
    const finish = (up) => { sock.destroy(); done(up); };
    sock.once('connect', () => finish(true));
    sock.once('error', () => finish(false));
    sock.setTimeout(400, () => finish(false));
  });
}

const children = [];
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      // Windows has no POSIX process groups (and `detached: true` isn't usable
      // with a spawned .cmd there — see the `run()` comment) — `taskkill /t`
      // kills the whole child tree (npm.cmd -> node -> vite) by pid instead.
      if (IS_WIN) spawn('taskkill', ['/pid', String(c.pid), '/t', '/f'], { stdio: 'ignore' });
      else process.kill(-c.pid, 'SIGTERM');
    } catch { /* already gone */ }
  }
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function run(label, cwd, script, { critical = true } = {}) {
  // `detached: true` (used on POSIX so `process.kill(-pid)` can reach the
  // whole process group) isn't meaningful on Windows — no process groups
  // in that sense there; see shutdown()'s taskkill fallback instead.
  const child = spawn(NPM_CMD, ['run', script], {
    cwd,
    detached: !IS_WIN,
    shell: IS_WIN,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const forward = (stream, out) =>
    stream.on('data', (buf) => {
      for (const line of buf.toString().split('\n')) if (line.trim()) out.write(`[${label}] ${line}\n`);
    });
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (shuttingDown) return;
    if (critical) {
      console.error(`[${label}] exited (${code ?? 'signal'}) — shutting down.`);
      shutdown(code ?? 1);
    } else {
      console.log(`[${label}] exited (${code ?? 'signal'}); dev server keeps running.`);
    }
  });
  return child;
}

async function waitForPort(port, label, timeoutMs = 300_000) {
  const start = Date.now();
  process.stdout.write(`[run-app] waiting for ${label} on :${port} `);
  while (Date.now() - start < timeoutMs) {
    if (await portInUse(port)) { process.stdout.write('— up.\n'); return; }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write('\n');
  console.error(`[run-app] ${label} never answered on :${port} within ${timeoutMs / 1000}s.`);
  shutdown(1);
}

// ─── go ────────────────────────────────────────────────────────────
const wantBroker =
  name !== BROKER &&
  (flags.has('--broker') ||
    app.broker === 'required' ||
    (app.broker === 'auto' && !flags.has('--no-broker')));

if (app.broker === 'required' && flags.has('--no-broker')) {
  console.warn(`[run-app] warning: ${name} requires the STOMP broker — it will not load data without it.`);
}

if (await portInUse(appPort)) {
  console.error(`[run-app] :${appPort} is already in use — is ${name} (${track}) already running?`);
  process.exit(1);
}

if (wantBroker && !flags.has('--no-broker')) {
  if (await portInUse(BROKER_PORT)) {
    console.log(`[run-app] broker already listening on :${BROKER_PORT} — reusing it.`);
  } else {
    console.log(`[run-app] starting ${BROKER} on :${BROKER_PORT} (source track)`);
    run('broker', join(REPO, 'apps', 'source', BROKER), 'dev');
  }
}

console.log(`[run-app] starting ${name} (${track}) on :${appPort}`);
run('app', appDir, 'dev');

if (flags.has('--openfin')) {
  await waitForPort(appPort, `${name} dev server`);
  console.log(`[run-app] launching OpenFin platform (npm run client in ${track}/${name})`);
  // Not critical: quitting the OpenFin platform leaves the dev server up.
  run('openfin', appDir, 'client', { critical: false });
}
