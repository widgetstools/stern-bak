#!/usr/bin/env node
/**
 * verify-apps.mjs — smoke-test every @wellsfargo-starui/platform app dev server.
 *
 *   npm run verify:apps
 *   npm run verify:apps -- --skip-angular   # skip slow ng serve
 *
 * Exits non-zero if any app fails to serve its index within the timeout.
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const VITE_APPS = [
  ['@wellsfargo-starui/demo-react', 5190],
  ['@wellsfargo-starui/demo-configservice-react', 5191],
  ['@wellsfargo-starui/markets-ui-react-reference', 5174],
  ['@wellsfargo-starui/tutorial-basic', 5194],
  ['@wellsfargo-starui/tutorial-mockdata-provider', 5192],
  ['@wellsfargo-starui/tutorial-dataprovider-editor', 5193],
];

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2)));
const skipAngular = flags.has('skip-angular');

async function httpOk(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await httpOk(url)) return true;
    await sleep(1000);
  }
  return false;
}

function run(workspace, args, { cwd }) {
  return spawn(npmCmd, ['--prefix', 'apps', 'run', 'dev', `-w`, workspace, '--', ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
}

async function smokeVite(workspace, port, cwd) {
  const url = `http://127.0.0.1:${port}/`;
  if (await httpOk(url)) {
    console.log(`OK  ${workspace} (already on :${port})`);
    return true;
  }
  const child = run(workspace, ['--host', '127.0.0.1', '--port', String(port), '--strictPort', '--no-open'], { cwd });
  const ok = await waitForUrl(url, 90_000);
  child.kill('SIGTERM');
  await sleep(500);
  if (child.exitCode === null) child.kill('SIGKILL');
  if (ok) {
    console.log(`OK  ${workspace} (:${port})`);
    return true;
  }
  console.error(`FAIL ${workspace} — no HTTP response on :${port}`);
  return false;
}

async function smokeStomp(cwd) {
  const port = 8081;
  if (await waitForUrl(`http://127.0.0.1:${port}/`, 500)) {
    console.log(`OK  @wellsfargo-starui/stomp-view-server (already on :${port})`);
    return true;
  }
  const child = spawn(npmCmd, ['--prefix', 'apps', 'run', 'dev', '-w', '@wellsfargo-starui/stomp-view-server'], {
    cwd,
    stdio: 'ignore',
    env: process.env,
  });
  let open = false;
  for (let i = 0; i < 30; i++) {
    try {
      const net = await import('node:net');
      open = await new Promise((resolve) => {
        const s = net.createConnection({ host: '127.0.0.1', port }, () => {
          s.end();
          resolve(true);
        });
        s.on('error', () => resolve(false));
      });
      if (open) break;
    } catch {
      /* ignore */
    }
    await sleep(1000);
  }
  child.kill('SIGTERM');
  if (open) {
    console.log(`OK  @wellsfargo-starui/stomp-view-server (:${port})`);
    return true;
  }
  console.error('FAIL @wellsfargo-starui/stomp-view-server — port 8081 not open');
  return false;
}

async function smokeAngular(cwd) {
  const port = 4200;
  const url = `http://127.0.0.1:${port}/`;
  if (await httpOk(url)) {
    console.log(`OK  @wellsfargo-starui/demo-angular (already on :${port})`);
    return true;
  }
  const child = spawn(npmCmd, ['--prefix', 'apps', 'run', 'start', '-w', '@wellsfargo-starui/demo-angular', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd,
    stdio: 'ignore',
    env: process.env,
  });
  const ok = await waitForUrl(url, 120_000);
  child.kill('SIGTERM');
  await sleep(500);
  if (child.exitCode === null) child.kill('SIGKILL');
  if (ok) {
    console.log(`OK  @wellsfargo-starui/demo-angular (:${port})`);
    return true;
  }
  console.error('FAIL @wellsfargo-starui/demo-angular — no HTTP response on :4200');
  return false;
}

async function main() {
  const cwd = new URL('..', import.meta.url).pathname;
  let allOk = true;
  for (const [ws, port] of VITE_APPS) {
    if (!(await smokeVite(ws, port, cwd))) allOk = false;
  }
  if (!(await smokeStomp(cwd))) allOk = false;
  if (!skipAngular) {
    if (!(await smokeAngular(cwd))) allOk = false;
  } else {
    console.log('SKIP @wellsfargo-starui/demo-angular (--skip-angular)');
  }
  if (!allOk) process.exit(1);
  console.log('verify-apps: all smoke checks passed');
}

main();
