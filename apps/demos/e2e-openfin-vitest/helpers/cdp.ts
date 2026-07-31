/**
 * Chrome DevTools Protocol helpers for OpenFin E2E.
 *
 * OpenFin v13+ exposes the runtime on `--remote-debugging-port` (see manifest
 * `runtime.arguments` + `devtools_port`). Playwright connects via
 * `chromium.connectOverCDP()`; these helpers poll the same endpoint for
 * node-adapter specs that need to know the runtime is up before driving IAB.
 */

export interface CdpVersionInfo {
  Browser: string;
  'Protocol-Version': string;
  webSocketDebuggerUrl: string;
}

export interface CdpTarget {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl?: string;
}

export async function waitForCdpEndpoint(
  port = Number(process.env.OPENFIN_CDP_PORT ?? 9090),
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<CdpVersionInfo> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 250;
  const url = `http://127.0.0.1:${port}/json/version`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return (await res.json()) as CdpVersionInfo;
      }
    } catch {
      /* runtime still booting */
    }
    await sleep(intervalMs);
  }

  throw new Error(`[e2e-openfin] CDP endpoint ${url} not ready after ${timeoutMs}ms`);
}

export async function fetchCdpTargets(port = Number(process.env.OPENFIN_CDP_PORT ?? 9090)): Promise<CdpTarget[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!res.ok) {
    throw new Error(`[e2e-openfin] CDP /json/list failed: ${res.status}`);
  }
  return (await res.json()) as CdpTarget[];
}

export async function waitForCdpPage(
  match: (target: CdpTarget) => boolean,
  opts: { port?: number; timeoutMs?: number; intervalMs?: number } = {},
): Promise<CdpTarget> {
  const port = opts.port ?? Number(process.env.OPENFIN_CDP_PORT ?? 9090);
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 500;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const targets = await fetchCdpTargets(port);
    const hit = targets.find(match);
    if (hit) return hit;
    await sleep(intervalMs);
  }

  throw new Error(`[e2e-openfin] no CDP page matched within ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
