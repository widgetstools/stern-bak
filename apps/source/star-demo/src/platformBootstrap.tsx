import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  ensureConfigReady,
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type ConfigReadyBundle,
  type PlatformBootstrapConfig,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/data';
import {
  resolvePlatformBootstrapFromManifest,
  setConfigManager,
  setPlatformDefaultScope,
} from '@wellsfargo-starui/openfin/config';
import workerAssetUrl from '@wellsfargo-starui/data/assets/data-services-worker.mjs?url';
import { ensureAiAssistantDockButton } from './aiAssistant/ensureDockButton';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: ResolvedDataServicesHubBundle;
}

/** Config-only bootstrap result — ConfigManager without the data hub. */
export interface ConfigBootstrapResult {
  config: PlatformBootstrapConfig;
  configManager: ConfigReadyBundle['configManager'];
}

const PlatformBootstrapContext = createContext<PlatformBootstrapResult | null>(null);

export function PlatformBootstrapProvider({
  value,
  children,
}: {
  value: PlatformBootstrapResult;
  children: ReactNode;
}): ReactNode {
  return (
    <PlatformBootstrapContext.Provider value={value}>
      {children}
    </PlatformBootstrapContext.Provider>
  );
}

export function usePlatformBootstrap(): PlatformBootstrapResult {
  const ctx = useContext(PlatformBootstrapContext);
  if (!ctx) {
    throw new Error('usePlatformBootstrap() requires PlatformBootstrapProvider');
  }
  return ctx;
}

function isOpenFinRuntime(): boolean {
  if (typeof globalThis === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fin = (globalThis as any).fin;
  return Boolean(fin?.Platform?.getCurrentSync);
}

let configBootstrapPromise: Promise<ConfigBootstrapResult> | undefined;
let platformBootstrapPromise: Promise<PlatformBootstrapResult> | undefined;

/**
 * Config-only bootstrap: manifest/app-config identity + ConfigManager.
 * Windows that never touch the data plane (workspace setup, small fin
 * dialogs) suspend on this instead of {@link initPlatformBootstrap},
 * skipping the SharedWorker hub connect + AppData snapshot + catalog
 * preload that used to gate every route.
 *
 * Browser: `/app-config.json` (seedConfigUrl only). OpenFin: manifest
 * `customSettings` (prefer pinned `appId` / `userId`; else seed identity).
 */
export function initConfigBootstrap(): Promise<ConfigBootstrapResult> {
  if (!configBootstrapPromise) {
    configBootstrapPromise = (async () => {
      const config = isOpenFinRuntime()
        ? await resolvePlatformBootstrapFromManifest()
        : await resolvePlatformBootstrapFromJson('/app-config.json');
      const { configManager } = await ensureConfigReady(config);
      setConfigManager(configManager);
      // Adopt the platform's (appId, userId) for dock/registry config ids.
      // `initWorkspace` does this in the provider window, but child windows
      // (AI Assistant, Data Providers, Config Browser) never call it — so
      // without this they fall back to the legacy `system/system` scope and
      // read/write a DIFFERENT row than the dock does. That made registry
      // writes from those windows land somewhere the platform never reads
      // (and the app's own ConfigManager then filtered out on read), so a
      // component registered from a child window silently vanished.
      setPlatformDefaultScope({ appId: config.appId, userId: config.userId });
      // Fire-and-forget: seeding a cosmetic dock button must not sit in front
      // of the data-plane bootstrap that every data route waits on. It's
      // best-effort and self-heals on the next boot if it fails.
      void ensureAiAssistantDockButton(config.appId).catch((err) => {
        console.warn('[platformBootstrap] ensureAiAssistantDockButton failed — dock button may be missing:', err);
      });
      return { config, configManager };
    })();
  }
  return configBootstrapPromise;
}

/**
 * Full platform bootstrap: config bootstrap plus the data-services hub
 * (SharedWorker connect, AppData mirror snapshot, catalog preload).
 * `ensurePlatformReady` reuses the ConfigManager from
 * {@link initConfigBootstrap}, so upgrading a window from config-only
 * to full costs no second IndexedDB connection.
 */
export function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  if (!platformBootstrapPromise) {
    platformBootstrapPromise = (async () => {
      const { config } = await initConfigBootstrap();
      const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
      setConfigManager(platform.configManager);
      return { config, platform };
    })();
  }
  return platformBootstrapPromise;
}
