/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * Test bridge — exposes a small set of WorkspacePlatform.Storage
 * operations, plus the platform's own registered-component launch, over an
 * OpenFin Channel so out-of-runtime test code (the Playwright specs in
 * `apps/e2e-openfin/` driven via `@openfin/node-adapter`) can drive
 * saved-workspace lifecycle and open blotters the way a dock click does,
 * without direct access to the in-runtime `@openfin/workspace-platform`
 * module.
 *
 * Loaded lazily ONLY in dev/test builds (callers gate on
 * `import.meta.env.DEV` or equivalent). Code-split out of any
 * production bundle. The IAB channel name `marketsui-test-bridge`
 * is what the e2e-openfin specs connect to.
 *
 * No-ops when `fin` is undefined (running in a plain browser, e.g.
 * during demo-react smoke runs). That keeps the call site uniform:
 * every app can call `installTestBridge()` unconditionally; the
 * function decides whether to register the channel.
 *
 * Contract — every action returns `{ ok: true, data? }` on success
 * or `{ ok: false, error: string }` on failure. Errors are caught
 * and turned into structured responses so the test runner doesn't
 * see opaque IAB timeouts when the platform throws.
 *
 * Previously lived in `apps/markets-ui-react-reference/src/test-bridge/`.
 * Moved here so future apps (Angular, demo-react in OpenFin shell) can
 * reuse the bridge without copying it.
 */

const CHANNEL_NAME = 'marketsui-test-bridge';

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

/** `launchComponent` payload — a Component Registry entry id, as a dock button carries it. */
export interface LaunchComponentPayload {
  entryId: string;
  /**
   * A View in a platform Browser window (default — what a dock click does)
   * or a standalone Window. Same-app windows share the provider's renderer
   * unless given a `processAffinity`, so a heavy blotter launched as a
   * window stalls every platform API call the provider makes (measured:
   * `createWindow` 0.4 s → 27 s → 66 s with one, two, three such windows
   * open); views are isolated by `viewProcessAffinityStrategy`.
   */
  asWindow?: boolean;
}

/** One live Component Registry entry, as `listRegistry` reports it. */
export interface RegistryEntrySummary {
  id: string;
  displayName: string;
  componentType: string;
  componentSubType: string;
  hostUrl: string;
  singleton: boolean;
}

/** What `launchComponent` reports back: the OpenFin identity plus the launch identity the platform stamped. */
export interface LaunchedComponent {
  uuid: string;
  name: string;
  /** What the platform created — a View (`fin.View.wrapSync(...).destroy()`) or a Window (`.close()`). */
  kind: 'view' | 'window';
  /** The minted per-instance id (`customData.instanceId`), or `null` if the platform stamped none. */
  instanceId: string | null;
  url: string | null;
}

async function safe<T>(fn: () => Promise<T>): Promise<Reply<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

let installed = false;

/** Test-only: allow re-installing the channel between vitest cases. */
export function __resetTestBridgeForTests(): void {
  installed = false;
}

export async function installTestBridge(): Promise<void> {
  if (installed) return;
  if (typeof fin === 'undefined') return;

  // Dynamic import keeps @openfin/workspace-platform out of the test
  // bridge's static-analysis graph (so production code-splits don't drag
  // it into views that don't need it). Resolves at install time inside
  // the platform provider window which always has it available.
  const WP = await import('@openfin/workspace-platform');

  const provider = await fin.InterApplicationBus.Channel.create(CHANNEL_NAME);

  provider.register('saveWorkspace', async (workspace: unknown) =>
    safe(async () => {
      const platform = WP.getCurrentSync();
      await platform.Storage.saveWorkspace(workspace as never);
      return null;
    }),
  );

  provider.register('getWorkspaces', async () =>
    safe(async () => {
      const platform = WP.getCurrentSync();
      return await platform.Storage.getWorkspaces();
    }),
  );

  provider.register('getWorkspace', async (payload: { id: string }) =>
    safe(async () => {
      const platform = WP.getCurrentSync();
      return await platform.Storage.getWorkspace(payload.id);
    }),
  );

  provider.register('deleteWorkspace', async (payload: { id: string }) =>
    safe(async () => {
      const platform = WP.getCurrentSync();
      await platform.Storage.deleteWorkspace(payload.id);
      return null;
    }),
  );

  // The live Component Registry. Entry ids differ per environment (the seed's
  // ids only hold on a fresh profile), so a harness picks an entry by its
  // route rather than by a hard-coded id.
  provider.register('listRegistry', async () =>
    safe(async (): Promise<RegistryEntrySummary[]> => {
      const { loadRegistryConfig } = await import('../db.js');
      const registry = await loadRegistryConfig();
      return (registry?.entries ?? []).map((e) => ({
        id: e.id,
        displayName: e.displayName ?? '',
        componentType: e.componentType,
        componentSubType: e.componentSubType,
        hostUrl: e.hostUrl ?? '',
        singleton: e.singleton === true,
      }));
    }),
  );

  // Launch a registered component exactly as a dock click does: the
  // platform mints the instanceId, clones the template's config row onto
  // it (profiles + provider selection) and stamps the identity on the URL
  // and customData — so an e2e blotter carries a provider like the dock's
  // own views. A bare `Platform.createWindow` would open a row-less blotter
  // that renders the "no provider" grid.
  provider.register('launchComponent', async (payload: LaunchComponentPayload) =>
    safe(async (): Promise<LaunchedComponent> => {
      const { launchRegisteredComponent } = await import('../launch.js');
      const t0 = Date.now();
      const owner = await launchRegisteredComponent(payload.entryId, { asWindow: payload.asWindow === true });
      if (!owner) throw new Error(`registry entry '${payload.entryId}' not found`);
      const o = owner as any;
      const tLaunched = Date.now();
      const options = await o.getOptions();
      // eslint-disable-next-line no-console
      console.info(`[test-bridge] launchComponent ${payload.entryId}: launch ${tLaunched - t0}ms, getOptions ${Date.now() - tLaunched}ms`);
      return {
        uuid: o.identity?.uuid ?? '',
        name: o.identity?.name ?? '',
        kind: typeof o.destroy === 'function' ? 'view' : 'window',
        instanceId: typeof options?.customData?.instanceId === 'string' ? options.customData.instanceId : null,
        url: typeof options?.url === 'string' ? options.url : null,
      };
    }),
  );

  // Remove a config row — the per-instance clone a launch created — so test
  // runs don't accumulate rows in the shared config DB.
  provider.register('deleteConfig', async (payload: { configId: string }) =>
    safe(async () => {
      const { getConfigManager } = await import('../db.js');
      const cm = await getConfigManager();
      await cm.deleteConfig(payload.configId);
      return null;
    }),
  );

  // Sentinel action so test code can verify the bridge is installed
  // without needing a full workspace round-trip.
  provider.register('ping', async () => ({ ok: true, data: 'pong' }));

  installed = true;
  // eslint-disable-next-line no-console
  console.log(`[test-bridge] installed channel '${CHANNEL_NAME}'`);
}
