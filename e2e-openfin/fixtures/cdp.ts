/**
 * CDP polling helpers — moved verbatim from the legacy Vitest harness
 * (now at apps/demos/e2e-openfin-vitest/helpers/cdp.ts).
 *
 * OpenFin v13+ exposes the runtime on `--remote-debugging-port` (see
 * the openfin-workspace manifest `runtime.arguments` + `devtools_port`).
 * Playwright's `chromium.connectOverCDP()` attaches over the same port;
 * these helpers poll the endpoint until the runtime is ready and the
 * blotter view's tab has appeared.
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForCdpEndpoint(
  port: number,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<CdpVersionInfo> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 250;
  const url = `http://127.0.0.1:${port}/json/version`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as CdpVersionInfo;
    } catch {
      /* runtime still booting */
    }
    await sleep(intervalMs);
  }

  throw new Error(`[e2e-openfin] CDP endpoint ${url} not ready after ${timeoutMs}ms`);
}

export async function fetchCdpTargets(port: number): Promise<CdpTarget[]> {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!res.ok) {
    throw new Error(`[e2e-openfin] CDP /json/list failed: ${res.status}`);
  }
  return (await res.json()) as CdpTarget[];
}

export async function waitForCdpPage(
  port: number,
  match: (target: CdpTarget) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<CdpTarget> {
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
