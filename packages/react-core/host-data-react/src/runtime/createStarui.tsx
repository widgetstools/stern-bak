/**
 * createStarui — the one-call bootstrap for a starui app.
 *
 * Replaces the app-side plumbing that previously took ~10 coupled steps
 * (app-config.json, ensurePlatformReady singleton module, worker asset
 * import, DataHubProvider wiring, hand-seeded IndexedDB provider rows,
 * storage factory construction, identity threading):
 *
 * ```tsx
 * const starui = createStarui({
 *   appId: 'MyApp',
 *   userId: 'trader1',
 *   providers: [myStompProvider],
 * });
 *
 * createRoot(el).render(
 *   <starui.Provider>
 *     <StarGrid gridId="blotter" providerId="dp-positions" />
 *   </starui.Provider>,
 * );
 * ```
 *
 * Identity is declared exactly once. `<StarGrid>` (and anything else
 * using {@link useStaruiIdentity}) reads appId / userId / the storage
 * factory from context — no per-grid identity props, no fallback
 * chains, no dev defaults leaking into production.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { DataProviderConfig } from '@wellsfargo-starui/types';
import {
  LocalStorageBundleAdapter,
  type StorageAdapter,
  type StorageAdapterFactory,
} from '@wellsfargo-starui/core';
import { createConfigServiceStorage } from '@wellsfargo-starui/core/host/config';
import {
  ensurePlatformReady,
  DataProviderConfigStore,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/data';
import { DataHubProvider } from './DataHubProvider.js';

export interface CreateStaruiOptions {
  /** Application id — scopes the SharedWorker hub and every config row. */
  appId: string;
  /** User id — owns profiles, private providers, and AppData rows. */
  userId: string;
  /**
   * Data-provider rows guaranteed to exist in the catalog. Each draft
   * MUST carry a deterministic `providerId`; rows are created when
   * missing and left untouched when present, so edits made later in the
   * Data Provider Editor survive reloads.
   */
  providers?: readonly DataProviderConfig[];
  /**
   * Where grid profiles persist.
   *  - `'localStorage'` (default) — zero-setup, per-browser.
   *  - `'config'` — the ConfigService row store (IndexedDB, optionally
   *    mirrored to REST via `configServiceRestUrl`); shareable and
   *    seedable.
   */
  storage?: 'localStorage' | 'config';
  /** Optional seed.json URL applied on first launch (config storage). */
  seedConfigUrl?: string;
  /** Optional ConfigService REST mirror. */
  configServiceRestUrl?: string;
  /**
   * Worker script URL override. Normally omitted — the library resolves
   * its own bundled worker entry. Pass only for CDN / manifest hosting.
   */
  workerScriptUrl?: string;
  /** Rendered while the platform boots. Default: nothing. */
  fallback?: ReactNode;
}

export interface StaruiIdentity {
  appId: string;
  userId: string;
  storage: StorageAdapterFactory;
}

export interface Starui extends StaruiIdentity {
  /** Wrap the app once; provides data services + identity context. */
  Provider: (props: { children: ReactNode }) => ReactElement;
}

const StaruiContext = createContext<StaruiIdentity | null>(null);

/**
 * Identity + storage declared by {@link createStarui}. Null when no
 * `<starui.Provider>` is above the caller.
 */
export function useStaruiIdentity(): StaruiIdentity | null {
  return useContext(StaruiContext);
}

function localStorageFactory(): StorageAdapterFactory {
  const adapters = new Map<string, StorageAdapter>();
  return ({ gridId, instanceId }) => {
    // gridId ≡ instanceId in the storage layer; either identifies the grid.
    const key = gridId ?? instanceId;
    let adapter = adapters.get(key);
    if (!adapter) {
      adapter = new LocalStorageBundleAdapter(key);
      adapters.set(key, adapter);
    }
    return adapter;
  };
}

async function ensureProviders(
  bundle: ResolvedDataServicesHubBundle,
  providers: readonly DataProviderConfig[],
  userId: string,
): Promise<void> {
  const store = new DataProviderConfigStore(bundle.configManager);
  for (const draft of providers) {
    if (!draft.providerId) {
      throw new Error(
        `[createStarui] provider "${draft.name}" needs a deterministic providerId ` +
        '(random ids would re-seed a new row every launch).',
      );
    }
    const existing = await store.get(draft.providerId).catch(() => null);
    if (!existing) {
      await store.save(draft, userId);
    }
  }
}

export function createStarui(options: CreateStaruiOptions): Starui {
  const {
    appId,
    userId,
    providers = [],
    storage = 'localStorage',
    seedConfigUrl,
    configServiceRestUrl,
    workerScriptUrl,
    fallback = null,
  } = options;

  let platformPromise: Promise<ResolvedDataServicesHubBundle> | null = null;
  let currentFactory: StorageAdapterFactory =
    storage === 'localStorage' ? localStorageFactory() : (opts) => {
      throw new Error(
        `[createStarui] config storage requested before the platform booted (gridId=${opts.gridId}). ` +
        'Mount grids inside <starui.Provider>.',
      );
    };
  /** Stable facade — delegates to whichever backend is live. */
  const storageFacade: StorageAdapterFactory = (opts) => currentFactory(opts);

  const boot = (): Promise<ResolvedDataServicesHubBundle> => {
    if (!platformPromise) {
      platformPromise = (async () => {
        const bundle = await ensurePlatformReady(
          { appId, userId, seedConfigUrl, configServiceRestUrl },
          workerScriptUrl ? { workerScriptUrl } : {},
        );
        if (storage === 'config') {
          currentFactory = createConfigServiceStorage({ configManager: bundle.configManager });
        }
        await ensureProviders(bundle, providers, userId);
        return bundle;
      })();
    }
    return platformPromise;
  };

  const identity: StaruiIdentity = { appId, userId, storage: storageFacade };

  function Provider({ children }: { children: ReactNode }): ReactElement {
    const [bundle, setBundle] = useState<ResolvedDataServicesHubBundle | null>(null);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
      let cancelled = false;
      boot().then(
        (b) => { if (!cancelled) setBundle(b); },
        (err: unknown) => {
          if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
        },
      );
      return () => { cancelled = true; };
    }, []);

    if (error) throw error;
    if (!bundle) return <>{fallback}</>;

    return (
      <DataHubProvider platform={bundle} userId={userId}>
        <StaruiContext.Provider value={identity}>
          {children}
        </StaruiContext.Provider>
      </DataHubProvider>
    );
  }

  return { Provider, appId, userId, storage: storageFacade };
}
