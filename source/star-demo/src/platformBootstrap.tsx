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
} from '@wellsfargo-starui/openfin/config';
import workerAssetUrl from '@wellsfargo-starui/data/assets/data-services-worker.mjs?url';

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
