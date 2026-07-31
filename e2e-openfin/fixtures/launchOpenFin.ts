/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Playwright fixtures for the star-demo OpenFin e2e harness.
 *
 * star-demo is the fully-configured reference workspace app (STOMP data
 * provider seeded from `/seed.json`, dock + provider window, dev test
 * bridge). This harness drives it through a real OpenFin runtime:
 *
 *   • `@openfin/node-adapter` `launch()` boots the platform from the
 *     manifest and `connect()` gives an out-of-runtime `fin` proxy.
 *   • The dev-only IAB test bridge (`marketsui-test-bridge`, installed by
 *     star-demo's Provider) exposes WorkspacePlatform.Storage ops and
 *     doubles as the "platform ready" probe (`getWorkspaces` succeeds only
 *     once the WorkspacePlatform module is live).
 *   • Blotter windows are launched with `Platform.createWindow()` and a
 *     distinct `customData.instanceId` (+ matching `?instanceId=` so each
 *     window's CDP URL is unique). `useHostedIdentity` reads that id, so
 *     every blotter scopes its own profile-set config row.
 *   • DOM assertions run through Playwright via `chromium.connectOverCDP`.
 *     New top-level OpenFin windows don't surface on an already-attached
 *     connection, so `openBlotter` reconnects fresh to resolve the page.
 *
 * Workers are forced to 1 (see playwright.config.ts) because a single
 * OpenFin runtime owns the CDP port for the whole run.
 */
import { setDefaultResultOrder } from 'node:dns';
import { test as base, chromium, type Browser, type Page } from '@playwright/test';
import { connect, launch } from '@openfin/node-adapter';
import { fetchCdpTargets, waitForCdpEndpoint, waitForCdpPage } from './cdp.js';

try { setDefaultResultOrder('ipv4first'); } catch { /* old node */ }

const MANIFEST_URL =
  process.env.OPENFIN_MANIFEST_URL ??
  'http://localhost:5175/platform/manifest.fin.json';
const APP_ORIGIN = process.env.OPENFIN_APP_ORIGIN ?? 'http://localhost:5175';
const CDP_PORT = Number(process.env.OPENFIN_CDP_PORT ?? 9091);
const CDP_ENDPOINT = `http://127.0.0.1:${CDP_PORT}`;
const BRIDGE_CHANNEL = 'marketsui-test-bridge';
const BLOTTER_ROUTE = '/blotters/marketsgrid';

const BOOT_TIMEOUT_MS = 90_000;
const BRIDGE_TIMEOUT_MS = 90_000;
const OPEN_BLOTTER_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BridgeReply<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface BridgeClient {
  ping(): Promise<BridgeReply<string>>;
  saveWorkspace(workspace: unknown): Promise<BridgeReply<null>>;
  getWorkspaces(): Promise<BridgeReply<any[]>>;
  getWorkspace(id: string): Promise<BridgeReply<any | undefined>>;
  deleteWorkspace(id: string): Promise<BridgeReply<null>>;
}

export interface PlatformHandle {
  fin: any;
  platformUuid: string;
  bridge: BridgeClient;
  /**
   * Launch a MarketsGrid blotter window with a distinct `instanceId` and
   * return a Playwright Page attached to it. Each call opens its own CDP
   * connection (kept alive until teardown) so previously-returned pages
   * stay usable across successive launches.
   */
  openBlotter: (instanceId: string) => Promise<Page>;
  /**
   * Close every blotter window opened so far (and its CDP connection).
   * Called automatically after each test so windows don't accumulate and
   * load the shared hub across the run.
   */
  closeOpenedBlotters: () => Promise<void>;
}

async function findPageByUrlPart(browser: Browser, urlPart: string): Promise<Page | undefined> {
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url().includes(urlPart)) return p;
    }
  }
  return undefined;
}

async function waitForBridge(fin: any, timeoutMs: number): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const channel = await Promise.race([
      fin.InterApplicationBus.Channel.connect(BRIDGE_CHANNEL).catch(() => null),
      sleep(750).then(() => null),
    ]);
    if (channel) return channel;
    await sleep(500);
  }
  return null;
}

/** getWorkspaces() succeeds only once WorkspacePlatform.getCurrentSync() is live. */
async function waitForPlatformReady(bridge: BridgeClient, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const reply = await bridge.getWorkspaces();
    if (reply.ok) return;
    await sleep(500);
  }
  throw new Error(`[e2e-openfin] platform storage API not ready after ${timeoutMs}ms`);
}

async function launchPlatform(): Promise<{ handle: PlatformHandle; dispose: () => Promise<void> }> {
  const adapterPort = await launch({ manifestUrl: MANIFEST_URL });
  await waitForCdpEndpoint(CDP_PORT, { timeoutMs: BOOT_TIMEOUT_MS });

  const fin = await connect({
    uuid: `starui-e2e-${Date.now()}`,
    address: `ws://127.0.0.1:${adapterPort}`,
    nonPersistent: true,
  });

  const manifest = await fin.System.fetchManifest(MANIFEST_URL);
  const platformUuid: string | undefined = manifest?.platform?.uuid;
  if (!platformUuid) {
    throw new Error(`[e2e-openfin] manifest ${MANIFEST_URL} has no platform.uuid`);
  }

  const providerUrl: string | undefined = manifest?.platform?.providerUrl;
  if (providerUrl) {
    const base = providerUrl.split('?')[0] ?? providerUrl;
    await waitForCdpPage(CDP_PORT, (t) => t.type === 'page' && t.url.startsWith(base), {
      timeoutMs: BOOT_TIMEOUT_MS,
    });
  }

  const rawBridge = await waitForBridge(fin, BRIDGE_TIMEOUT_MS);
  if (!rawBridge) {
    throw new Error(
      '[e2e-openfin] test bridge never appeared — is star-demo running in DEV mode and did ' +
        'initWorkspace() complete? See e2e-openfin/README.md',
    );
  }

  const bridge: BridgeClient = {
    ping: () => rawBridge.dispatch('ping') as Promise<BridgeReply<string>>,
    saveWorkspace: (ws) => rawBridge.dispatch('saveWorkspace', ws) as Promise<BridgeReply<null>>,
    getWorkspaces: () => rawBridge.dispatch('getWorkspaces') as Promise<BridgeReply<any[]>>,
    getWorkspace: (id) =>
      rawBridge.dispatch('getWorkspace', { id }) as Promise<BridgeReply<any | undefined>>,
    deleteWorkspace: (id) => rawBridge.dispatch('deleteWorkspace', { id }) as Promise<BridgeReply<null>>,
  };

  await waitForPlatformReady(bridge, BOOT_TIMEOUT_MS);

  const openedBrowsers: Browser[] = [];
  const openedWindowNames: string[] = [];

  const openBlotter = async (instanceId: string): Promise<Page> => {
    const windowName = `e2e-blotter-${instanceId}`;
    const url = `${APP_ORIGIN}${BLOTTER_ROUTE}?instanceId=${encodeURIComponent(instanceId)}`;
    const platform = fin.Platform.wrapSync({ uuid: platformUuid });
    await platform.createWindow({
      name: windowName,
      url,
      defaultWidth: 1200,
      defaultHeight: 760,
      autoShow: true,
      customData: { instanceId, templateId: instanceId },
    });
    openedWindowNames.push(windowName);

    const urlPart = `instanceId=${encodeURIComponent(instanceId)}`;
    const deadline = Date.now() + OPEN_BLOTTER_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
      const page = await findPageByUrlPart(browser, urlPart);
      if (page) {
        openedBrowsers.push(browser);
        return page;
      }
      await browser.close();
      await sleep(500);
    }
    throw new Error(`[e2e-openfin] blotter window for instanceId='${instanceId}' never attached`);
  };

  const closeOpenedBlotters = async (): Promise<void> => {
    for (const b of openedBrowsers.splice(0)) {
      try { await b.close(); } catch { /* already gone */ }
    }
    for (const name of openedWindowNames.splice(0)) {
      try { await fin.Window.wrapSync({ uuid: platformUuid, name }).close(true); } catch { /* gone */ }
    }
  };

  const handle: PlatformHandle = { fin, platformUuid, bridge, openBlotter, closeOpenedBlotters };

  const dispose = async (): Promise<void> => {
    await closeOpenedBlotters();
    try {
      const platform = fin.Platform.wrapSync({ uuid: platformUuid });
      await platform.quit();
      await sleep(1_000);
    } catch (err) {
      const msg = String((err as any)?.message ?? err);
      if (!msg.includes('no longer connected') && !msg.includes('already')) {
        console.warn('[e2e-openfin] quit error:', msg);
      }
    }
  };

  return { handle, dispose };
}

interface WorkerFixtures {
  platform: PlatformHandle;
}

interface TestFixtures {
  /** Auto fixture: closes blotter windows opened during each test. */
  cleanupBlotters: void;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  platform: [
    async ({}, use) => {
      const { handle, dispose } = await launchPlatform();
      await use(handle);
      await dispose();
    },
    { scope: 'worker' },
  ],
  cleanupBlotters: [
    async ({ platform }, use) => {
      await use();
      await platform.closeOpenedBlotters();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';

/** Re-export so specs can reuse the CDP target probe if they need it. */
export { fetchCdpTargets };
