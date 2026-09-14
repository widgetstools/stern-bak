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
 *   • Blotters are launched through the bridge's `launchComponent`, i.e. the
 *     platform's own `launchRegisteredComponent` — what a dock button runs,
 *     as a VIEW in a platform Browser window. Every instance runs on the
 *     registry entry's template config row (profiles + provider selection):
 *     `customData.instanceId` and the URL's `?instanceId=` are the template
 *     id for all of them, so a blotter always has a provider, exactly like
 *     a dock-launched view, and the harness tells instances apart by view
 *     name. Two things never to do here: a bare `Platform.createWindow`
 *     opens a row-less blotter that renders the "no provider" grid (no
 *     columns, no rows); and `asWindow: true` puts the blotter in the
 *     provider's renderer (same-app windows share it unless given a
 *     processAffinity), where one loaded 20k-row blotter saturates the
 *     thread the platform API runs on — the next launch then took 27 s,
 *     the one after 66 s. Views are isolated per the manifest's
 *     `viewProcessAffinityStrategy`.
 *   • The bridge installs in a Vite DEV build, or in any build when the
 *     provider URL carries `?e2eBridge=1` — against a production preview,
 *     point `OPENFIN_MANIFEST_URL` at a manifest copy whose `providerUrl`
 *     has that flag (see README).
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
const CDP_PORT = Number(process.env.OPENFIN_CDP_PORT ?? 9091);
const CDP_ENDPOINT = `http://127.0.0.1:${CDP_PORT}`;
const BRIDGE_CHANNEL = 'marketsui-test-bridge';
/** The MarketsGrid blotter route; the Component Registry entry that launches it is looked up live. */
const BLOTTER_ROUTE = '/blotters/marketsgrid';
/** Optional override: a Component Registry entry id to launch instead of the route lookup. */
const BLOTTER_ENTRY_OVERRIDE = process.env.OPENFIN_BLOTTER_ENTRY;

/** Blotter window size after launch — wide enough for the ticking columns to render. */
const BLOTTER_WINDOW_WIDTH = 1400;
const BLOTTER_WINDOW_HEIGHT = 800;

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

export interface LaunchedComponent {
  uuid: string;
  name: string;
  kind: 'view' | 'window';
  instanceId: string | null;
  url: string | null;
}

export interface RegistryEntrySummary {
  id: string;
  displayName: string;
  componentType: string;
  componentSubType: string;
  hostUrl: string;
  singleton: boolean;
}

export interface BridgeClient {
  ping(): Promise<BridgeReply<string>>;
  /** The live Component Registry (ids differ per environment; the seed's only hold on a fresh profile). */
  listRegistry(): Promise<BridgeReply<RegistryEntrySummary[]>>;
  saveWorkspace(workspace: unknown): Promise<BridgeReply<null>>;
  getWorkspaces(): Promise<BridgeReply<any[]>>;
  getWorkspace(id: string): Promise<BridgeReply<any | undefined>>;
  deleteWorkspace(id: string): Promise<BridgeReply<null>>;
  /** The platform's registered-component launch (a dock click): a View by default, a standalone Window with `asWindow`. */
  launchComponent(payload: { entryId: string; asWindow?: boolean }): Promise<BridgeReply<LaunchedComponent>>;
}

export interface PlatformHandle {
  fin: any;
  platformUuid: string;
  bridge: BridgeClient;
  /**
   * Launch a MarketsGrid blotter view through the platform (fresh minted
   * `instanceId`, template row cloned onto it, its own Browser window) and
   * return a Playwright Page attached to it. Each call opens its own CDP
   * connection (kept alive until teardown) so previously-returned pages
   * stay usable across successive launches.
   */
  openBlotter: () => Promise<Page>;
  /**
   * Destroy every blotter view opened so far (and its CDP connection).
   * Called automatically after each test so blotters don't accumulate and
   * load the shared hub across the run.
   */
  closeOpenedBlotters: () => Promise<void>;
}

/** The CDP target id behind a Playwright page — answered by the browser process, so cheap even for a busy page. */
async function targetIdOf(page: Page): Promise<string | undefined> {
  try {
    const session = await page.context().newCDPSession(page);
    const { targetInfo } = (await session.send('Target.getTargetInfo')) as { targetInfo: { targetId: string } };
    await session.detach();
    return targetInfo.targetId;
  } catch {
    return undefined;
  }
}

/**
 * Every instance of a component shares its URL (`?instanceId=<template id>`),
 * so the launched view is found among the pages with that URL that this
 * harness has not claimed yet (by target id). One unclaimed candidate is
 * the launch; several (a restored layout, say) are told apart by the
 * view's OpenFin name, read from the page — a page still booting answers
 * nothing yet, and the caller polls.
 */
async function findLaunchedPage(
  browser: Browser,
  urlPart: string,
  viewName: string,
  claimed: ReadonlySet<string>,
): Promise<{ page: Page; targetId: string } | undefined> {
  const candidates: Array<{ page: Page; targetId: string }> = [];
  for (const ctx of browser.contexts()) {
    for (const page of ctx.pages()) {
      if (!page.url().includes(urlPart)) continue;
      const targetId = await targetIdOf(page);
      if (!targetId || claimed.has(targetId)) continue;
      candidates.push({ page, targetId });
    }
  }
  if (candidates.length === 1) return candidates[0];
  for (const candidate of candidates) {
    const name = await Promise.race([
      candidate.page
        .evaluate(() => (globalThis as unknown as { fin?: { me?: { name?: string } } }).fin?.me?.name)
        .catch(() => undefined),
      sleep(3_000).then(() => undefined),
    ]);
    if (name === viewName) return candidate;
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
    listRegistry: () => rawBridge.dispatch('listRegistry') as Promise<BridgeReply<RegistryEntrySummary[]>>,
    saveWorkspace: (ws) => rawBridge.dispatch('saveWorkspace', ws) as Promise<BridgeReply<null>>,
    getWorkspaces: () => rawBridge.dispatch('getWorkspaces') as Promise<BridgeReply<any[]>>,
    getWorkspace: (id) =>
      rawBridge.dispatch('getWorkspace', { id }) as Promise<BridgeReply<any | undefined>>,
    deleteWorkspace: (id) => rawBridge.dispatch('deleteWorkspace', { id }) as Promise<BridgeReply<null>>,
    launchComponent: (payload) =>
      rawBridge.dispatch('launchComponent', payload) as Promise<BridgeReply<LaunchedComponent>>,
  };

  await waitForPlatformReady(bridge, BOOT_TIMEOUT_MS);

  const openedBrowsers: Browser[] = [];
  const openedEntities: Array<{ name: string; kind: 'view' | 'window' }> = [];
  /** Targets of the blotters still open in the current test (teardown waits for them to leave the runtime). */
  const openedTargetIds: string[] = [];
  /** Every target this run has ever attached to — a lingering destroyed view is never mistaken for a new launch. */
  const claimedTargetIds = new Set<string>();

  // The platform opens a launched view in an 800×500 window and AG Grid 36
  // renders only the columns that fit — the ticking columns sit to the right
  // of the static id/name ones and never enter the DOM. The view does not
  // follow its window (resizing or maximising the window left it 792 px
  // wide), so size the view itself to fill the widened window — after the
  // page has loaded, or the platform's attach flow puts the bounds back.
  const warnWiden = (err: unknown) =>
    console.warn(`[e2e-openfin] could not widen the blotter: ${String((err as Error).message).split('\n')[0]}`);
  const widenWindow = async (name: string): Promise<void> => {
    try {
      await fin.Window.wrapSync({ uuid: platformUuid, name }).resizeTo(BLOTTER_WINDOW_WIDTH, BLOTTER_WINDOW_HEIGHT, 'top-left');
    } catch (err) { warnWiden(err); }
  };
  const widenView = async (name: string): Promise<void> => {
    try {
      const view = fin.View.wrapSync({ uuid: platformUuid, name });
      const win = await view.getCurrentWindow();
      await win.resizeTo(BLOTTER_WINDOW_WIDTH, BLOTTER_WINDOW_HEIGHT, 'top-left');
      const [{ content }, vb] = await Promise.all([win.getBounds(), view.getBounds()]);
      const margin = Math.max(0, vb.left);
      await view.setBounds({
        left: vb.left,
        top: vb.top,
        width: Math.max(vb.width, content.width - vb.left - margin),
        height: Math.max(vb.height, content.height - vb.top - margin),
      });
    } catch (err) { warnWiden(err); }
  };

  // The registry entry that launches the blotter route, resolved once from
  // the live registry (entry ids are per environment) unless overridden.
  let blotterEntryId: string | undefined = BLOTTER_ENTRY_OVERRIDE;
  const resolveBlotterEntryId = async (): Promise<string> => {
    if (blotterEntryId) return blotterEntryId;
    const reply = await bridge.listRegistry();
    if (!reply.ok) throw new Error(`[e2e-openfin] listRegistry failed: ${reply.error}`);
    const entries = reply.data ?? [];
    const hit = entries.find((e) => !e.singleton && e.hostUrl.includes(BLOTTER_ROUTE));
    if (!hit) {
      const listed = entries.map((e) => `${e.id} → ${e.hostUrl}`).join(', ') || '(none)';
      throw new Error(
        `[e2e-openfin] no Component Registry entry launches ${BLOTTER_ROUTE} (set OPENFIN_BLOTTER_ENTRY to pick one); entries: ${listed}`,
      );
    }
    blotterEntryId = hit.id;
    return hit.id;
  };

  const openBlotter = async (): Promise<Page> => {
    const entryId = await resolveBlotterEntryId();
    const t0 = Date.now();
    const launched = await bridge.launchComponent({ entryId });
    const launchMs = Date.now() - t0;
    if (!launched.ok) {
      throw new Error(`[e2e-openfin] launchComponent('${entryId}') failed: ${launched.error}`);
    }
    const launchedData = launched.data;
    if (!launchedData?.instanceId) {
      throw new Error(
        `[e2e-openfin] launchComponent('${entryId}') stamped no instanceId on ${launchedData?.name ?? '(no window)'}`,
      );
    }
    const { name, kind, instanceId } = launchedData;
    openedEntities.push({ name, kind });

    const urlPart = `instanceId=${encodeURIComponent(instanceId)}`;
    const deadline = Date.now() + OPEN_BLOTTER_TIMEOUT_MS;
    let attempts = 0;
    while (Date.now() < deadline) {
      attempts += 1;
      const tConnect = Date.now();
      // A connect attaches to every target on the runtime and waits for each
      // to answer; a target that is tearing down or a blotter whose main
      // thread is saturated can hold that up (a healthy connect takes
      // 0.2–3 s), so a slow attempt is retried rather than failing the launch.
      let browser: Browser;
      try {
        browser = await chromium.connectOverCDP(CDP_ENDPOINT, { timeout: 8_000 });
      } catch (err) {
        console.warn(`[e2e-openfin] connectOverCDP attempt ${attempts} failed: ${String((err as Error).message).split('\n')[0]}`);
        await sleep(1_000);
        continue;
      }
      const connectMs = Date.now() - tConnect;
      const pageCount = browser.contexts().reduce((n, c) => n + c.pages().length, 0);
      const found = await findLaunchedPage(browser, urlPart, name, claimedTargetIds);
      if (found) {
        const { page, targetId } = found;
        openedBrowsers.push(browser);
        claimedTargetIds.add(targetId);
        openedTargetIds.push(targetId);
        // Size the view only once its grid has mounted: the platform re-applies
        // the view's bounds while the page is still loading, so an earlier
        // setBounds is undone. AG Grid re-lays out on the container resize.
        await page.locator('.ag-root-wrapper').first().waitFor({ state: 'attached', timeout: 45_000 }).catch(() => undefined);
        await (kind === 'view' ? widenView(name) : widenWindow(name));
        console.log(
          `[e2e-openfin] blotter ${instanceId}: launch ${launchMs}ms, attached ${Date.now() - t0 - launchMs}ms later ` +
            `(${attempts} connect${attempts === 1 ? '' : 's'}, last ${connectMs}ms, ${pageCount} pages on the runtime)`,
        );
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
    for (const { name, kind } of openedEntities.splice(0)) {
      try {
        if (kind === 'view') await fin.View.wrapSync({ uuid: platformUuid, name }).destroy();
        else await fin.Window.wrapSync({ uuid: platformUuid, name }).close(true);
      } catch { /* gone */ }
    }
    const targetIds = new Set(openedTargetIds.splice(0));
    // A destroyed blotter's target lingers on the runtime for a moment and a
    // `connectOverCDP` that attaches to it can stall, so wait for the targets
    // to leave the list before the next launch attaches (the attach loop's
    // retry still covers the stalls this does not prevent).
    const gone = Date.now() + 10_000;
    while (targetIds.size > 0 && Date.now() < gone) {
      const targets = await fetchCdpTargets(CDP_PORT).catch(() => []);
      if (!targets.some((t) => targetIds.has(t.id))) break;
      await sleep(250);
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
