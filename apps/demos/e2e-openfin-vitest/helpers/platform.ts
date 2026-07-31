/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OpenFin platform-launch helper for end-to-end tests.
 *
 * Wraps @openfin/node-adapter so specs can `await launchPlatform()` and get
 * back a connected `fin` proxy plus a `quit()` cleanup.
 *
 * Also waits for the CDP endpoint (remote-debugging-port) and the dev-only
 * test-bridge IAB channel. Channel.connect() blocks until the provider
 * creates the channel — each attempt is raced with a short timeout so
 * polling does not hang the whole suite.
 */

import { connect, launch } from '@openfin/node-adapter';
import { setDefaultResultOrder } from 'node:dns';
import { waitForCdpEndpoint, waitForCdpPage } from './cdp.js';

const TEST_BRIDGE_CHANNEL = 'marketsui-test-bridge';
const DEFAULT_CDP_PORT = Number(process.env.OPENFIN_CDP_PORT ?? 9090);

try { setDefaultResultOrder('ipv4first'); } catch { /* old node */ }

export interface BridgeReply<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface LaunchedPlatform {
  fin: any;
  manifest: any;
  bridge: BridgeClient;
  quit: () => Promise<void>;
}

export interface BridgeClient {
  ping(): Promise<BridgeReply<string>>;
  saveWorkspace(workspace: unknown): Promise<BridgeReply<null>>;
  getWorkspaces(): Promise<BridgeReply<any[]>>;
  getWorkspace(id: string): Promise<BridgeReply<any | undefined>>;
  deleteWorkspace(id: string): Promise<BridgeReply<null>>;
}

export interface LaunchPlatformOptions {
  /** Poll budget for CDP + provider window. Default 60s. */
  bootTimeoutMs?: number;
  /** Poll budget for test-bridge channel. Default 90s. */
  bridgeTimeoutMs?: number;
  cdpPort?: number;
}

/**
 * Launch the OpenFin platform from a manifest URL, connect via node-adapter,
 * wait for CDP + provider, then return a handle including the test-bridge client.
 */
export async function launchPlatform(
  manifestUrl: string,
  opts: LaunchPlatformOptions = {},
): Promise<LaunchedPlatform> {
  const bootTimeoutMs = opts.bootTimeoutMs ?? 60_000;
  const bridgeTimeoutMs = opts.bridgeTimeoutMs ?? 90_000;
  const cdpPort = opts.cdpPort ?? DEFAULT_CDP_PORT;

  console.log(`[e2e-openfin] launching ${manifestUrl}`);
  const adapterPort = await launch({ manifestUrl });

  console.log(`[e2e-openfin] waiting for CDP on port ${cdpPort}`);
  await waitForCdpEndpoint(cdpPort, { timeoutMs: bootTimeoutMs });

  const fin = await connect({
    uuid: `mui-e2e-${Date.now()}`,
    address: `ws://127.0.0.1:${adapterPort}`,
    nonPersistent: true,
  });

  const manifest = await fin.System.fetchManifest(manifestUrl);
  const platformUuid: string | undefined = manifest?.platform?.uuid;
  if (!platformUuid) {
    throw new Error(`[e2e-openfin] manifest at ${manifestUrl} has no platform.uuid`);
  }
  console.log(`[e2e-openfin] connected — platform uuid: ${platformUuid}`);

  const providerUrl: string | undefined = manifest?.platform?.providerUrl;
  if (providerUrl) {
    console.log(`[e2e-openfin] waiting for provider window: ${providerUrl}`);
    await waitForCdpPage(
      (t) => t.type === 'page' && t.url.startsWith(providerUrl.split('?')[0] ?? providerUrl),
      { port: cdpPort, timeoutMs: bootTimeoutMs },
    );
  }

  const bridgeRaw = await waitForBridgeChannel(fin, bridgeTimeoutMs);
  if (!bridgeRaw) {
    throw new Error(
      '[e2e-openfin] test bridge channel never appeared — is the dev server running in DEV mode ' +
        'and did initWorkspace() complete? See e2e-openfin/README.md',
    );
  }
  console.log('[e2e-openfin] connected to test bridge');

  const bridgeClient: BridgeClient = {
    ping: () => bridgeRaw.dispatch('ping') as Promise<BridgeReply<string>>,
    saveWorkspace: (ws) => bridgeRaw.dispatch('saveWorkspace', ws) as Promise<BridgeReply<null>>,
    getWorkspaces: () => bridgeRaw.dispatch('getWorkspaces') as Promise<BridgeReply<any[]>>,
    getWorkspace: (id) => bridgeRaw.dispatch('getWorkspace', { id }) as Promise<BridgeReply<any | undefined>>,
    deleteWorkspace: (id) => bridgeRaw.dispatch('deleteWorkspace', { id }) as Promise<BridgeReply<null>>,
  };

  await waitForPlatformReady(bridgeClient, bootTimeoutMs);

  let quitting = false;
  const quit = async (): Promise<void> => {
    if (quitting) return;
    quitting = true;
    try {
      const platform = fin.Platform.wrapSync({ uuid: platformUuid });
      await platform.quit();
      await sleep(1_500);
    } catch (err) {
      const msg = String((err as any)?.message ?? err);
      if (!msg.includes('no longer connected') && !msg.includes('already')) {
        console.warn('[e2e-openfin] quit error:', msg);
      }
    }
  };

  return { fin, manifest, bridge: bridgeClient, quit };
}

/** Storage API needs WorkspacePlatform.getCurrentSync(); ping alone is not enough. */
async function waitForPlatformReady(bridge: BridgeClient, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const list = await bridge.getWorkspaces();
    if (list.ok) {
      console.log('[e2e-openfin] platform storage API ready');
      return;
    }
    await sleep(500);
  }
  throw new Error(`[e2e-openfin] platform storage API not ready after ${timeoutMs}ms`);
}

/**
 * Poll for the test-bridge channel. Each connect attempt is capped so OpenFin's
 * blocking "Waiting for connection…" log does not stall the suite.
 */
async function waitForBridgeChannel(fin: any, timeoutMs: number): Promise<any | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const channel = await tryConnectChannel(fin, 750);
    if (channel) return channel;
    await sleep(500);
  }
  console.warn(`[e2e-openfin] test bridge not found after ${timeoutMs}ms`);
  return null;
}

async function tryConnectChannel(fin: any, attemptTimeoutMs: number): Promise<any | null> {
  return Promise.race([
    fin.InterApplicationBus.Channel.connect(TEST_BRIDGE_CHANNEL).catch(() => null),
    sleep(attemptTimeoutMs).then(() => null),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
