/**
 * React bindings for `@wellsfargo-starui/data` — one context provider +
 * focused hooks.
 *
 * Surface:
 *   <DataHubProvider platform={hub} userId={config.userId} />  — preferred
 *   <DataServicesProvider services={ds} mode="lazy"|"eager" /> — legacy
 *   useDataServices()              — escape hatch to the raw client
 *   useAppDataStore()              — reactive AppData snapshot
 *   useDataProviderConfig(id)      — single saved config row
 *   useResolvedCfg(cfg)            — apply {{...}} templates against AppData
 *   useDataProvider(id, opts?)       — hub-backed IDataProvider (preferred)
 *   useProviderStream(id, cfg, listener, opts?) — attach with auto-detach (deprecated)
 *   useProviderStats(id, listener) — stats subscription with auto-detach
 *
 * Each hook is < 60 LOC; the file as a whole is the only React glue
 * the data-services runtime needs.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  DataListener,
  StatsListener,
} from '@wellsfargo-starui/data/runtime/client';
import {
  collectTemplateRefs,
  resolveCfg,
  type AppDataMirror,
} from '@wellsfargo-starui/data/runtime';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';
import type { DataProviderConfig, TransportConfig } from '@wellsfargo-starui/types';
import {
  DataServicesProvider,
  useDataServicesContext,
  useUserIdFromContext,
  type ContextValue,
} from './DataServicesProvider.js';

export {
  DataServicesProvider,
  useUserIdFromContext,
  usePlatformIdentityOrNull,
  type DataServicesProviderProps,
  type ContextValue,
  type PlatformIdentity,
} from './DataServicesProvider.js';
export {
  DataHubProvider,
  PlatformProvider,
  type DataHubProviderProps,
  type DataHubProviderWithBootstrapProps,
  type DataHubProviderWithPlatformProps,
} from './DataHubProvider.js';
export { HubInspectorDrawer, type HubInspectorDrawerProps } from './HubInspectorDrawer.js';
export { HubInspectorHost } from './HubInspectorHost.js';

// ─── Hook 1: raw client + stores escape hatch ────────────────────

export function useDataServices(): ContextValue {
  return useDataServicesContext();
}

// ─── Hook 2: AppData reactive snapshot ───────────────────────────
//
// Returns a stable object whose `.get(name, key)` reflects the current
// snapshot, plus a counter that bumps every time AppData changes so
// downstream hooks can re-resolve cfgs. The store loads on first use
// (idempotent across re-renders).

export interface AppDataView {
  store: AppDataMirror;
  /** Bumps on every AppData mutation. Use as a dependency to drive
   *  re-resolution of templates. */
  version: number;
  /** Whether `ready()` has resolved at least once. False on the very
   *  first render before async load completes. */
  loaded: boolean;
}

export function useAppDataStore(): AppDataView {
  const { appData } = useDataServicesContext();
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    appData.ready().then(() => { if (!cancelled) setLoaded(true); });
    const off = appData.subscribe(() => setVersion((v) => v + 1));
    return () => { cancelled = true; off(); };
  }, [appData]);

  return { store: appData, version, loaded };
}

// ─── Hook 2b: scoped AppData hook for a single provider ─────────
//
// Reactive, name-scoped view of one AppData provider's variables.
// Consumers anywhere in the tree can read + mutate values without
// touching the store directly:
//
//   const { values, get, set } = useAppData('positions');
//   await set('asOfDate', '2026-04-30');
//   const dt = get('asOfDate');
//
// Updates fire whenever any key on this named provider changes.
// `set()` writes through `AppDataStore.set()`, which honours
// ConfigManager persistence (durability semantics live there).

export interface AppDataHandle {
  /** Current key→value map. Empty until the store has loaded. */
  values: Record<string, unknown>;
  /** Whether `AppDataStore.ready()` has resolved at least once. */
  loaded: boolean;
  /** Sync read. Returns undefined for unknown keys or pre-load. */
  get(key: string): unknown;
  /** Write a single key. Creates the AppData row on first set if it
   *  doesn't already exist (with the active user as owner, not public). */
  set(key: string, value: unknown): Promise<void>;
  /** Replace the entire variable map for this provider in one round-trip. */
  setMany(values: Record<string, unknown>): Promise<void>;
}

export function useAppData(providerName: string): AppDataHandle {
  const { store, version, loaded } = useAppDataStore();
  const sessionUserId = useUserIdFromContext();

  const values = useMemo<Record<string, unknown>>(() => {
    const row = store.list().find((r) => r.name === providerName);
    return row ? { ...row.values } : {};
    // version drives re-computation on every AppData mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerName, store, version, loaded]);

  const get = useCallback((key: string) => store.get(providerName, key), [store, providerName]);

  const set = useCallback(
    (key: string, value: unknown) => store.set(providerName, key, value),
    [store, providerName],
  );

  const setMany = useCallback(
    async (next: Record<string, unknown>) => {
      const existing = store.list().find((r) => r.name === providerName);
      await store.upsertConfig({
        configId: existing?.configId ?? '',
        name: providerName,
        description: existing?.description,
        isPublic: existing?.isPublic ?? false,
        values: next,
        // userId is single-user-pinned across the codebase. Preserve a
        // public ('system') row's userId; otherwise land on the canonical
        // logged-in user id so a fresh row never gets userId=''.
        userId: existing?.userId ?? sessionUserId,
      });
    },
    [store, providerName, sessionUserId],
  );

  return { values, loaded, get, set, setMany };
}

// ─── Hook 3: single DataProviderConfig row ───────────────────────

export interface DataProviderConfigView {
  cfg: DataProviderConfig | null;
  loading: boolean;
  error?: string;
}

/** Per-attempt response deadline for {@link useDataProviderConfig}. */
const GET_CONFIG_ATTEMPT_TIMEOUT_MS = 2_500;
/** Total attempts before surfacing the failure as `error`. */
const GET_CONFIG_ATTEMPTS = 3;

export function useDataProviderConfig(providerId: string | null | undefined): DataProviderConfigView {
  const { client } = useDataServicesContext();
  const [view, setView] = useState<DataProviderConfigView>({ cfg: null, loading: Boolean(providerId) });
  const [tick, setTick] = useState(0);
  // Which providerId the current `view.cfg` was actually loaded for.
  // Without this, switching A → B kept A's cfg visible (with
  // loading:false) until B's fetch landed — consumers attached
  // provider B with provider A's cfg for a whole round-trip.
  const loadedForIdRef = useRef<string | null>(null);

  useEffect(() => {
    return client.onCatalogChange((detail) => {
      if (detail.full || detail.providerId === providerId) {
        setTick((t) => t + 1);
      }
    });
  }, [client, providerId]);

  useEffect(() => {
    let cancelled = false;
    if (!providerId) {
      loadedForIdRef.current = null;
      setView({ cfg: null, loading: false });
      return;
    }
    if (loadedForIdRef.current === providerId) {
      // Same provider (catalog-change refresh): keep the current cfg
      // visible while the fresh row loads.
      setView((prev) => ({ ...prev, loading: prev.cfg === null, error: undefined }));
    } else {
      // Provider switch: the previous cfg belongs to ANOTHER provider.
      setView({ cfg: null, loading: true });
    }
    // Time-bounded with retries — a `get-config` issued in the worker's
    // first moments can go unanswered (the worker-side catalog read stalls
    // during boot; a re-issued request succeeds — see WORKLOG item 14).
    // An unbounded single await turns that into a permanent
    // "Loading provider configuration…"; bounded retries turn it into a
    // sub-3s blip, and a real failure surfaces as `error` instead of an
    // infinite spinner.
    const TIMED_OUT = Symbol('get-config-timeout');
    const run = async () => {
      for (let attempt = 1; attempt <= GET_CONFIG_ATTEMPTS && !cancelled; attempt++) {
        try {
          const cfg = await Promise.race([
            client.getProviderConfig(providerId),
            new Promise<typeof TIMED_OUT>((resolve) => {
              setTimeout(() => resolve(TIMED_OUT), GET_CONFIG_ATTEMPT_TIMEOUT_MS);
            }),
          ]);
          if (cancelled) return;
          if (cfg === TIMED_OUT) {
            // No response at all — the boot-window loss. Re-issue; only
            // after the last silent attempt does the timeout surface.
            if (attempt === GET_CONFIG_ATTEMPTS) {
              setView((prev) => ({
                cfg: prev.cfg,
                loading: false,
                error: `get-config for "${providerId}" got no response within `
                  + `${GET_CONFIG_ATTEMPTS} × ${GET_CONFIG_ATTEMPT_TIMEOUT_MS}ms`,
              }));
            }
            continue;
          }
          loadedForIdRef.current = providerId;
          setView({ cfg, loading: false });
          return;
        } catch (err: unknown) {
          // An explicit rejection is an authoritative answer — surface it
          // immediately, keeping the stale-but-known cfg.
          if (!cancelled) {
            setView((prev) => ({
              cfg: prev.cfg,
              loading: false,
              error: err instanceof Error ? err.message : String(err),
            }));
          }
          return;
        }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [providerId, client, tick]);

  return view;
}

// ─── Hook 3b: list DataProvider configs ──────────────────────────
//
// Returns the union of public (userId='system') + the active user's
// own DataProvider rows, optionally filtered by subtype. Re-fetches
// when `version` bumps — exposed via `refresh()` so consumers can
// re-pull after a save without re-mounting the picker.

export interface DataProvidersListView {
  configs: readonly DataProviderConfig[];
  loading: boolean;
  error?: string;
  refresh(): void;
}

export function useDataProvidersList(
  opts: { subtype?: TransportConfig['providerType']; includeAppData?: boolean } = {},
): DataProvidersListView {
  const { client } = useDataServicesContext();
  const [view, setView] = useState<{ configs: readonly DataProviderConfig[]; loading: boolean; error?: string }>(
    { configs: [], loading: true },
  );
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    return client.onCatalogChange((detail) => {
      if (detail.full || detail.providerId) {
        setTick((t) => t + 1);
      }
    });
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    setView((v) => ({ ...v, loading: v.configs.length === 0 }));
    const listOpts: { subtype?: TransportConfig['providerType']; includeAppData?: boolean } = {};
    if (opts.subtype) listOpts.subtype = opts.subtype;
    if (opts.includeAppData) listOpts.includeAppData = true;
    client.listProviderConfigs(listOpts)
      .then((rows) => { if (!cancelled) setView({ configs: rows, loading: false }); })
      .catch((err: unknown) => {
        if (!cancelled) setView({ configs: [], loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [client, opts.subtype, opts.includeAppData, tick]);

  return { ...view, refresh };
}

// ─── Hook 4: template-resolved cfg ───────────────────────────────
//
// Walks any `{{name.key}}` tokens in the cfg's strings against the
// current AppData snapshot. Returns a stable object that swaps ONLY
// when an AppData key the cfg actually references changes — so
// downstream `useProviderStream` / `useDataProvider` deps re-attach
// exactly when the resolved cfg could differ. (The old shape re-ran
// resolveCfg on EVERY AppData version bump: any provider writing any
// key minted a fresh cfg identity and cascaded a full detach/attach
// through every consumer, even with zero templates in the cfg.)

export function useResolvedCfg(cfg: TransportConfig | null | undefined): TransportConfig | null {
  const { store, version, loaded } = useAppDataStore();

  // Template refs are a pure function of the cfg object.
  const refs = useMemo(() => (cfg ? collectTemplateRefs(cfg) : []), [cfg]);

  const lastRef = useRef<{
    cfg: TransportConfig;
    values: unknown[];
    resolved: TransportConfig;
  } | null>(null);

  return useMemo(() => {
    if (!cfg) {
      lastRef.current = null;
      return null;
    }
    if (!loaded) return cfg; // pre-load, return as-is — caller usually waits for `loaded` anyway
    if (refs.length === 0) return cfg; // no templates → nothing to resolve, keep identity

    // Snapshot the referenced values. For nested keys ({{name.a.b}})
    // resolution may go through lookup(name, 'a') + object walk, so
    // snapshot the head value too — a replaced head object must bust
    // the memo even when lookup(name, 'a.b') stays undefined.
    const values: unknown[] = [];
    for (const { providerName, key } of refs) {
      values.push(store.get(providerName, key));
      const dot = key.indexOf('.');
      values.push(dot >= 0 ? store.get(providerName, key.slice(0, dot)) : undefined);
    }

    const last = lastRef.current;
    if (
      last &&
      last.cfg === cfg &&
      last.values.length === values.length &&
      last.values.every((v, i) => Object.is(v, values[i]))
    ) {
      return last.resolved;
    }

    const resolved = resolveCfg(cfg, (name, key) => store.get(name, key));
    lastRef.current = { cfg, values, resolved };
    return resolved;
    // `version` participates so AppData mutations re-check the refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, refs, version, loaded, store]);
}

export {
  useDataProvider,
  type UseDataProviderOpts,
  type UseDataProviderResult,
} from './useDataProvider.js';

export {
  useSsrmDataProvider,
  type UseSsrmDataProviderOpts,
  type UseSsrmDataProviderResult,
} from './useSsrmDataProvider.js';

// ─── Hook 5: provider data subscription (legacy) ───────────────
//
// Hides the manual subId tracking + detach-on-unmount. Listener
// methods are stored in a ref so callers can pass inline closures
// without re-subscribing on every render — only `providerId` and the
// cfg identity drive resubscription.

export interface ProviderStreamHandle {
  status: ProviderStatus;
  error?: string;
  /** Re-attach with `extra` — convenience around the toolbar refresh
   *  button. The Hub will turn this into a `provider.restart(extra)`. */
  refresh(extra?: Record<string, unknown>): void;
}

/**
 * @deprecated Use {@link useDataProvider} for catalogued providers — cfg-free hub
 * attach via `IDataProvider`. Pass inline `cfg` only for editor drafts not yet
 * saved to the catalog. Toolbar reload-from-source maps to `IDataProvider.restart()`;
 * cache-only resync maps to `IDataProvider.refresh()`. Removed in a follow-up major.
 */
export function useProviderStream<T = unknown>(
  providerId: string | null | undefined,
  cfg: TransportConfig | null | undefined,
  listener: DataListener<T>,
): ProviderStreamHandle {
  const { client } = useDataServicesContext();
  const [status, setStatus] = useState<ProviderStatus>('loading');
  const [error, setError] = useState<string | undefined>(undefined);
  const subIdRef = useRef<string | null>(null);

  const listenerRef = useRef(listener);
  useEffect(() => { listenerRef.current = listener; }, [listener]);

  useEffect(() => {
    if (!providerId || !cfg) {
      setStatus('loading');
      return;
    }
    setStatus('loading');
    setError(undefined);
    const sub = client.attach<T>(providerId, cfg, {
      onDelta: (rows, replace) => listenerRef.current.onDelta(rows, replace),
      onStatus: (s, err) => {
        setStatus(s);
        setError(err);
        listenerRef.current.onStatus(s, err);
      },
    });
    subIdRef.current = sub;
    return () => {
      client.detach(sub);
      subIdRef.current = null;
    };
  }, [providerId, cfg, client]);

  const refresh = useCallback((extra?: Record<string, unknown>) => {
    if (!providerId) return;
    // Send a fresh attach with extra; the Hub forwards to provider.restart.
    client.attach(providerId, undefined, {
      onDelta: () => undefined,
      onStatus: () => undefined,
    }, { extra: extra ?? { __refresh: Date.now() } });
  }, [client, providerId]);

  return { status, error, refresh };
}

// ─── Hook 6: provider stats subscription ─────────────────────────

export function useProviderStats(
  providerId: string | null | undefined,
  listener: StatsListener,
): void {
  const { client } = useDataServicesContext();
  const listenerRef = useRef(listener);
  useEffect(() => { listenerRef.current = listener; }, [listener]);

  useEffect(() => {
    if (!providerId) return;
    const sub = client.attachStats(providerId, {
      onStats: (stats) => listenerRef.current.onStats(stats),
    });
    return () => client.detach(sub);
  }, [providerId, client]);
}

// ─── Re-exports ──────────────────────────────────────────────────

export type {
  DataListener,
  StatsListener,
  AttachOpts,
  SubId,
  SharedWorkerDataServicesClient,
} from '@wellsfargo-starui/data/runtime/client';
export type {
  ProviderStats,
  ProviderStatus,
} from '@wellsfargo-starui/data/runtime';
export type {
  HubIntrospectSnapshot,
  HubProviderIntrospectRow,
  HubAppDataIntrospectRow,
} from '@wellsfargo-starui/data/runtime';
export { createAppDataServices, type CreateAppDataServicesOpts } from './createAppDataServices.js';

// ─── One-call app bootstrap ─────────────────────────────────────────
export {
  createStarui,
  useStaruiIdentity,
  StaruiIdentityProvider,
  type CreateStaruiOptions,
  type Starui,
  type StaruiIdentity,
} from './createStarui.js';
