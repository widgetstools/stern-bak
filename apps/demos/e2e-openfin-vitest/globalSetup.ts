/**
 * Vitest globalSetup — start markets-ui-react-reference on a dedicated E2E port
 * so tests never accidentally target another Vite app on 5174.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const E2E_DEV_PORT = Number(process.env.E2E_OPENFIN_DEV_PORT ?? 5197);
export const E2E_CDP_PORT = Number(process.env.OPENFIN_CDP_PORT ?? 9190);
export const E2E_MANIFEST_URL =
  process.env.MUI_MANIFEST_URL
  ?? `http://localhost:${E2E_DEV_PORT}/platform/manifest.e2e.fin.json`;

let devServer: ChildProcess | undefined;
let startedBySetup = false;

async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function probeMarketsUiServer(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/platform/manifest.e2e.fin.json`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isReachable(url)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`[e2e-openfin] timed out waiting for ${url}`);
}

export async function setup(): Promise<void> {
  process.env.E2E_OPENFIN_DEV_PORT = String(E2E_DEV_PORT);
  process.env.OPENFIN_CDP_PORT = String(E2E_CDP_PORT);
  process.env.MUI_MANIFEST_URL = E2E_MANIFEST_URL;

  const base = `http://localhost:${E2E_DEV_PORT}`;
  if (await probeMarketsUiServer(base)) {
    console.log(`[e2e-openfin] markets-ui E2E server already up (${E2E_MANIFEST_URL})`);
    return;
  }

  if (await isReachable(base)) {
    throw new Error(
      `[e2e-openfin] port ${E2E_DEV_PORT} is in use but does not serve manifest.e2e.fin.json. ` +
        'Stop the other process or set E2E_OPENFIN_DEV_PORT to a free port.',
    );
  }

  console.log(`[e2e-openfin] starting @wellsfargo-starui/markets-ui-react-reference on port ${E2E_DEV_PORT}…`);
  devServer = spawn(
    'npm',
    [
      'run',
      'dev',
      '-w',
      '@wellsfargo-starui/markets-ui-react-reference',
      '--',
      '--no-open',
      '--port',
      String(E2E_DEV_PORT),
      '--strictPort',
    ],
    {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0' },
    },
  );
  startedBySetup = true;

  devServer.stdout?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.log(`[e2e-openfin:dev] ${line}`);
  });
  devServer.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line) console.warn(`[e2e-openfin:dev] ${line}`);
  });

  await waitFor(E2E_MANIFEST_URL, 120_000);
  console.log('[e2e-openfin] E2E dev server ready');
}

export async function teardown(): Promise<void> {
  if (!startedBySetup || !devServer || devServer.killed) return;
  console.log('[e2e-openfin] stopping E2E dev server');
  devServer.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 1_000));
  if (!devServer.killed) devServer.kill('SIGKILL');
}

export default setup;
