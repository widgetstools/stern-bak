/**
 * MarketsGridContainer — v2.
 *
 *   - Provider selection persists at the GRID level (not per-profile)
 *     in the SAME storage row MarketsGrid uses for its profile-set,
 *     via the StorageAdapter's `loadGridLevelData / saveGridLevelData`
 *     methods. Profile switches preserve the selection because it's
 *     not stored in any individual profile.
 *   - Provider pickers, mode toggle, refresh/reload, and edit live in
 *     the grid customizer → Custom Settings panel (not a toolbar strip).
 *
 *   Persistence flow:
 *     - Container resolves the storage adapter from
 *       `props.storage({ instanceId, appId, userId })` once on mount.
 *     - Reads `loadGridLevelData(gridId)`; while pending, renders a
 *       small loading state. This guarantees MarketsGrid mounts
 *       exactly once with the correct rowIdField for the persisted
 *       provider — no remount-on-load loop.
 *     - On every selection mutation, calls `saveGridLevelData(gridId,
 *       selection)`. The adapter writes back to the same bundled row
 *       that holds the profile-set (top-level field, not nested in a
 *       profile).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef, GridApi } from 'ag-grid-community';
import { MarketsGrid, createMarketsGridContainerEventBus } from '@wellsfargo-starui/grid';
import { isHistoricalToolbarDate } from '@wellsfargo-starui/grid/customizer';
import type { MarketsGridProps, MarketsGridHandle, StorageAdapterFactory, ProviderGridHostApi, MarketsGridEventHandlerRegistry, MarketsGridHandlerMeta } from '@wellsfargo-starui/grid';
import type { StompProviderConfig } from '@wellsfargo-starui/types';
import { traceStompProviderCfg } from '@wellsfargo-starui/data/runtime';
import type { StorageAdapter } from '@wellsfargo-starui/core';
import {
  useDataProviderConfig,
  useResolvedCfg,
  useDataProvidersList,
  useAppDataStore,
  useDataProvider,
  useDataServices,
} from '@wellsfargo-starui/react/data/runtime';
import { buildColumnDefs } from './buildColumnDefs.js';
import { useProviderDataWiring } from './useProviderDataWiring.js';
import { useGridLevelPersistence } from './useGridLevelPersistence.js';
import { useAppDataLookup } from './useAppDataLookup.js';
import { useContainerCaption } from './useContainerCaption.js';
import { useContainerEventWiring } from './useContainerEventWiring.js';
import { DATA_PROVIDER_EDITOR_ACTION_ID, mergeAdminActions } from './mergeAdminActions.js';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import {
  createConfigBrowserAction,
} from '@wellsfargo-starui/grid/config-browser';
import type { AdminAction } from '@wellsfargo-starui/grid';
import { ConfigBrowserDialog } from './ConfigBrowserDialog.js';
import { ProviderEditorDialog } from './ProviderEditorDialog.js';
import { MarketsGridLoadingOverlay } from './LoadingOverlay.js';
import { isOpenFin } from '@wellsfargo-starui/openfin/host';
import {
  type ProviderMode,
  type ProviderSelection,
} from './gridLevelState.js';

export type { ProviderMode, ProviderSelection } from './gridLevelState.js';

const EMPTY: never[] = [];

/**
 * Gate for hot-path diagnostic logs. Flip to `true` locally when debugging
 * subscribe / update / unsubscribe behavior. The render-time log fires on
 * every render of the container; the update-batch logs fire per delta.
 * Both are off by default to avoid measurable CPU cost on busy providers.
 */
const DEBUG = false;

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface MarketsGridContainerProps<TData extends Record<string, unknown> = Record<string, unknown>>
  extends Omit<MarketsGridProps<TData>, 'rowData' | 'rowIdField' | 'columnDefs' | 'gridLevelData' | 'onGridLevelDataLoad' | 'headerExtras'> {
  /**
   * Where to write the historical date when the user picks one.
   * Format: `'appDataProviderName.key'` — e.g. `'positions.asOfDate'`.
   * The historical provider's cfg should reference this entry via
   * `{{positions.asOfDate}}` so the value flows through.
   * Required when a historical provider is supplied.
   */
  historicalDateAppDataRef?: string;
  /**
   * OpenFin only: called when the user edits the active provider from
   * Custom Settings. In a browser runtime the container opens
   * {@link DataProviderEditor} in a shadcn dialog instead.
   */
  onEditProvider?(providerId: string | null): void;
  /**
   * OpenFin only: called when the user opens Config Browser from the
   * toolbar overflow menu. In a browser runtime the container opens
   * {@link ConfigBrowserPanel} in a shadcn dialog instead.
   */
  onOpenConfigBrowser?(): void;
  /** Surface stream errors. Defaults to console.error. */
  onError?(error: Error): void;
  /**
   * When no live provider is persisted in grid-level data, select this
   * provider on first load (demo / single-provider apps).
   */
  defaultLiveProviderId?: string;
  /**
   * When no historical provider is persisted in grid-level data, select
   * this provider when the user picks a past toolbar date.
   */
  defaultHistoricalProviderId?: string;
  /** App registry of event handler functions keyed by stable id. */
  gridEventHandlers?: MarketsGridEventHandlerRegistry;
  /** Optional labels for Custom Settings event binding UI. */
  handlerMeta?: MarketsGridHandlerMeta;
  /**
   * Called whenever the resolved row-key field(s) change — the active
   * provider's `keyColumn` that drives `getRowId`. Lets a host (e.g.
   * `StarGrid`) wire grid-to-grid context linking off the SAME
   * fields without hardcoding them. `null` until a provider/key resolves.
   */
  onRowIdFieldChange?(rowIdField: string | readonly string[] | null): void;
}

export function MarketsGridContainer<TData extends Record<string, unknown> = Record<string, unknown>>(
  props: MarketsGridContainerProps<TData>,
) {
  const {
    historicalDateAppDataRef,
    onEditProvider,
    onOpenConfigBrowser,
    onError,
    onReady: onReadyProp,
    defaultLiveProviderId,
    defaultHistoricalProviderId,
    gridEventHandlers,
    handlerMeta,
    onRowIdFieldChange,
    ...marketsGridProps
  } = props;

  const containerEventBus = useMemo(() => createMarketsGridContainerEventBus(), []);
  const [gridHandle, setGridHandle] = useState<MarketsGridHandle | null>(null);

  const appData = useAppDataStore();
  const { client: dataHubClient } = useDataServices();
  const appDataLookup = useAppDataLookup();

  // ── Storage adapter ──────────────────────────────────────────────
  //
  // Same factory MarketsGrid uses for profile persistence; we resolve
  // a copy here to read/write the grid-level-data field of the same
  // row. Memoised on the identity-affecting tuple so a userId swap
  // (rare) rebuilds the adapter cleanly.
  const storageFactory = (props as { storage?: StorageAdapterFactory }).storage;
  const adapter = useMemo<StorageAdapter | null>(() => {
    if (!storageFactory) return null;
    const instanceId = props.instanceId ?? props.gridId;
    return storageFactory({
      instanceId,
      gridId: props.gridId,
      appId: props.appId,
      userId: props.userId,
    });
  }, [storageFactory, props.instanceId, props.gridId, props.appId, props.userId]);

  // ── Picker state + grid-level persistence ─────────────────────────
  //
  // Selection / caption / event-binding state and the load/persist/import
  // effects that keep them in sync with the storage adapter live in
  // useGridLevelPersistence. `loaded === false` while the first load is
  // pending — MarketsGrid mounts with the persisted selection in place once
  // it flips, so no second mount is needed when the load resolves.
  const {
    selection,
    setSelection,
    persistedCaption,
    setPersistedCaption,
    eventBindings,
    setEventBindings,
    loaded,
  } = useGridLevelPersistence({
    adapter,
    gridId: props.gridId,
    defaultLiveProviderId,
    defaultHistoricalProviderId,
    gridHandle,
  });

  const [asOfDate, setAsOfDate] = useState<string | null>(null);
  const [toolbarDate, setToolbarDate] = useState(todayIsoDate);
  // Carries the *intent* of a queued toolbar reload — the mode + asOfDate the
  // reload should run against — not a bare boolean. The ref is set
  // synchronously in the handler while the matching state updates commit a
  // render later; keying off the intent lets the reload effect fire exactly
  // once, when committed state catches up, with the correct payload.
  const pendingToolbarReloadRef = useRef<{ mode: ProviderMode; asOfDate: string | null } | null>(null);
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [configBrowserOpen, setConfigBrowserOpen] = useState(false);

  // Restore toolbar date from AppData when persisted mode is historical.
  useEffect(() => {
    if (!loaded || selection.mode !== 'historical' || !historicalDateAppDataRef) return;
    const dot = historicalDateAppDataRef.indexOf('.');
    if (dot <= 0) return;
    const name = historicalDateAppDataRef.slice(0, dot);
    const key = historicalDateAppDataRef.slice(dot + 1);
    const val = appData.store.get(name, key);
    if (typeof val === 'string' && isHistoricalToolbarDate(val)) {
      setToolbarDate(val);
      setAsOfDate(val);
      // Do not queue reload on mount — provider wiring late-joins when the
      // hub slot is already warm; restart only when this window cold-starts.
    }
  }, [loaded, selection.mode, historicalDateAppDataRef, appData.store]);

  // Persisted caption wins over the prop; a commit writes back to
  // grid-level data and chains the caller's own handler; an OpenFin tab
  // rename is adopted. See useContainerCaption.
  const { caption: effectiveCaption, onCaptionChange: handleCaptionChange } = useContainerCaption({
    propCaption: (marketsGridProps as { caption?: string }).caption,
    persistedCaption,
    setPersistedCaption,
    onCaptionChange: (marketsGridProps as { onCaptionChange?: (next: string) => void }).onCaptionChange,
  });

  // Changing the live/historical provider or the mode changes `activeId`,
  // which is part of the <MarketsGrid> `key` — so the grid remounts and a
  // fresh ProfileManager re-hydrates the customizer from disk. Under
  // `disableAutoSave`, other tabs' per-card "Save"s live only in the
  // in-memory store, so that remount would silently discard them (e.g. a
  // Grid Options status-bar edit lost when the provider is switched).
  // Save-and-switch: flush the working set to disk via the grid's own
  // saveAll() BEFORE applying the selection, so the remount re-hydrates the
  // latest state. `saveAll` is a stable bridge to the live store (the
  // handle's `profiles.isDirty` snapshot is captured at onReady and would
  // be stale), so we call it unconditionally — a clean save is a harmless
  // no-op write.
  const applyProviderSelection = useCallback(
    async (apply: (s: ProviderSelection) => ProviderSelection) => {
      const handle = gridHandleRef.current;
      if (handle) {
        try {
          await handle.saveAll();
        } catch (err) {
          console.warn('[markets-grid] save-before-provider-switch failed:', err);
        }
      }
      setSelection(apply);
    },
    [],
  );

  const setLiveId = useCallback((id: string | null) => {
    void applyProviderSelection((s) => ({ ...s, liveProviderId: id }));
  }, [applyProviderSelection]);
  const setHistoricalId = useCallback((id: string | null) => {
    void applyProviderSelection((s) => ({ ...s, historicalProviderId: id }));
  }, [applyProviderSelection]);
  const setMode = useCallback((mode: ProviderMode) => {
    void applyProviderSelection((s) => ({ ...s, mode }));
  }, [applyProviderSelection]);

  // ── Active provider resolution ────────────────────────────────────
  const activeId = selection.mode === 'live' ? selection.liveProviderId : selection.historicalProviderId;
  const activeRow = useDataProviderConfig(activeId);
  const activeCfg = useResolvedCfg(activeRow.cfg?.config ?? null);

  // List of available providers — ONE fetch + catalog subscription
  // serves both slots (they were two identical hook instances, each
  // with its own fetch, state, and catalog-change listener). Subtype
  // filter could be tightened (live=stomp, historical=rest) but
  // keeping it open is friendlier — the user might want a Mock for
  // either slot in dev.
  const providersList = useDataProvidersList();
  const liveList = providersList;
  const histList = providersList;

  // Log active provider name on change so it's easy to confirm which
  // provider a given grid is bound to at runtime.
  const activeProviderName = activeRow.cfg?.name ?? null;
  useEffect(() => {
    if (activeRow.loading) return;
    // eslint-disable-next-line no-console
    console.log(
      `[markets-grid] gridId=%s mode=%s providerId=%s providerName=%s`,
      props.gridId,
      selection.mode,
      activeId ?? '(none)',
      activeProviderName ?? '(none)',
    );
  }, [props.gridId, selection.mode, activeId, activeProviderName, activeRow.loading]);

  // Date picker writes through to AppData; historical refresh passes
  // `{ asOfDate }` via `provider.restart()`.
  const setAsOfDateAndPersist = useCallback((next: string | null) => {
    setAsOfDate(next);
    if (next) {
      setToolbarDate(next);
    }
    if (next && historicalDateAppDataRef) {
      const dot = historicalDateAppDataRef.indexOf('.');
      if (dot > 0) {
        const name = historicalDateAppDataRef.slice(0, dot);
        const key = historicalDateAppDataRef.slice(dot + 1);
        void appData.store.set(name, key, next);
      }
    }
  }, [appData.store, historicalDateAppDataRef]);

  const effectiveHistoricalProviderId =
    selection.historicalProviderId ?? defaultHistoricalProviderId ?? null;
  const toolbarDateHistoryEnabled = effectiveHistoricalProviderId != null;
  const isHistoricalView =
    selection.mode === 'historical'
    && asOfDate != null
    && isHistoricalToolbarDate(asOfDate);
  const historicalViewMessage = isHistoricalView
    ? `Viewing historical data as of ${asOfDate}. Editing is disabled.`
    : undefined;

  const handleToolbarDateChange = useCallback((next: string) => {
    setToolbarDate(next);
    const isHistorical = isHistoricalToolbarDate(next);

    if (isHistorical) {
      if (!effectiveHistoricalProviderId) {
        (onError ?? defaultOnError)(new Error(
          'Cannot load historical data: no historical provider is configured.',
        ));
        return;
      }
      setAsOfDateAndPersist(next);
      setSelection((s) => ({
        ...s,
        mode: 'historical',
        historicalProviderId: s.historicalProviderId ?? defaultHistoricalProviderId ?? null,
      }));
      pendingToolbarReloadRef.current = { mode: 'historical', asOfDate: next };
      containerEventBus.emit('toolbar:dateChanged', { date: next, historical: true });
      return;
    }

    if (selection.mode === 'historical') {
      setAsOfDate(null);
      setMode('live');
      pendingToolbarReloadRef.current = { mode: 'live', asOfDate: null };
    }
    containerEventBus.emit('toolbar:dateChanged', { date: next, historical: false });
  }, [
    effectiveHistoricalProviderId,
    defaultHistoricalProviderId,
    setAsOfDateAndPersist,
    setMode,
    selection.mode,
    onError,
    containerEventBus,
  ]);

  // `keyColumn` may be a single column name OR an array of column
  // names (composite key — values joined with `-`, see
  // `composeRowId` in @wellsfargo-starui/types/shared). We pass the raw shape
  // through to MarketsGrid + use it for the live-update add/update
  // dispatch below so the cache key matches AG-Grid's getRowId
  // byte-for-byte.
  const rowIdField = activeRow.cfg
    ? (activeCfg as { keyColumn?: string | readonly string[] } | null)?.keyColumn ?? null
    : null;
  // Stable string representation for keys / log output. For arrays,
  // joining is fine — colon separator avoids collision with the data
  // separator (`-`).
  const rowIdFieldKey = Array.isArray(rowIdField) ? rowIdField.join(':') : rowIdField;

  // Surface the resolved key column(s) to the host so context linking can
  // broadcast the exact fields getRowId is composed from (no hardcoding).
  // Keyed on the stable string form so arrays don't re-fire on identity churn.
  useEffect(() => {
    onRowIdFieldChange?.(rowIdField);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRowIdFieldChange, rowIdFieldKey]);

  // Map the provider's persisted `columnDefinitions` into AG-Grid
  // ColDefs. `buildColumnDefs` handles three cases per column:
  //   1. a DSL `valueGetter` expression → compiled (CSP-safe) getter,
  //   2. a dotted `field` → nested-path default getter,
  //   3. a flat field → AG-Grid's native fast path.
  // See ./buildColumnDefs.ts for the precedence + error-fallback rules.
  const columnDefs = useMemo<ColDef<TData>[] | null>(
    () =>
      buildColumnDefs<TData>(
        (activeCfg as { columnDefinitions?: ColDef<TData>[] } | null)?.columnDefinitions,
      ),
    [activeCfg],
  );

  // ── Grid lifecycle: capture the gridApi when AG-Grid is ready ────
  //
  // The grid mounts twice across a normal session:
  //   1. The "no provider" placeholder grid (empty cols, sentinel
  //      rowIdField). Press Alt+Shift+P / Meta+Shift+P to reveal the
  //      toolbar and pick a provider from the empty state.
  //   2. The real data-attached grid, mounted with a key that includes
  //      the provider id and key column.
  //
  // We only care about the api from mount #2. To distinguish the two
  // we stamp the captured api with the `key` it was created for; the
  // subscribe effect below only fires when the stamped key matches
  // the current `expectedKey`. An onReady from the placeholder grid
  // (where `expectedKey === null`) is a no-op stamp.
  const expectedKey = (activeId && !activeRow.loading && rowIdField && columnDefs)
    ? `${activeId}::${rowIdFieldKey}`
    : null;

  const [stamped, setStamped] = useState<{ key: string; api: GridApi<TData> } | null>(null);

  const expectedKeyRef = useRef(expectedKey);
  useEffect(() => { expectedKeyRef.current = expectedKey; }, [expectedKey]);

  // Latest grid handle, kept in a ref so the provider-change setters can
  // flush a save before the switch remounts the grid (see
  // `applyProviderSelection`) without re-creating those callbacks or
  // closing over a stale handle.
  const gridHandleRef = useRef<MarketsGridHandle | null>(null);

  const onReady = useCallback((handle: MarketsGridHandle) => {
    const k = expectedKeyRef.current;
    if (k) {
      setStamped({ key: k, api: handle.gridApi as GridApi<TData> });
    }
    gridHandleRef.current = handle;
    setGridHandle(handle);
    onReadyProp?.(handle);
  }, [onReadyProp]);

  const liveApi = stamped && stamped.key === expectedKey ? stamped.api : null;

  // ── IDataProvider hook ───────────────────────────────────────────
  //
  // Hub config comes from the worker catalog on `start()` — we keep
  // `useDataProviderConfig` / `useResolvedCfg` for column defs and
  // the picker only, not as an attach cfg pass-through.
  const providerReady = Boolean(activeId && !activeRow.loading && rowIdField && columnDefs);
  const {
    provider,
    refresh: refreshProvider,
    restart: restartProvider,
  } = useDataProvider<TData>(providerReady ? activeId : null, { autoStart: false });

  // Loading-overlay state — derived synchronously from a "subscription
  // key" so the overlay appears on the SAME render that mounts the
  // grid. If we used a useState+useEffect pair, AG-Grid would briefly
  // flash its built-in "No Rows To Show" overlay between mount and
  // the first useEffect tick. We track which subscription key has had
  // its snapshot resolved, and the overlay shows whenever the current
  // subscription key !== the resolved key.
  const subscriptionKey =
    activeId && rowIdField ? `${activeId}::${rowIdFieldKey}` : null;
  const [resolvedSubKey, setResolvedSubKey] = useState<string | null>(null);
  const [loadRowCount, setLoadRowCount] = useState<number | undefined>(undefined);
  // True while the provider is in the 'loading' phase of a peer-
  // triggered re-snapshot. Driven by the worker's status events, which
  // every subscriber receives — so all connected windows show the
  // overlay together, not just the one that pressed the refresh button.
  const [isRefetching, setIsRefetching] = useState(false);
  // Bubbled up from MarketsGrid whenever the active profile is being
  // persisted (Save button or save-on-switch). We reuse the same
  // snapshot loading overlay component for visual consistency, just
  // with a "Saving…" caption.
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  // True when the live provider stops or the transport disconnects.
  // Grid data may be stale; MarketsGrid shows a flashing banner and
  // disables cell editing until status returns to ready.
  const [providerDisconnected, setProviderDisconnected] = useState(false);
  const [disconnectDetail, setDisconnectDetail] = useState<string | undefined>();
  const isLoadingSnapshot = subscriptionKey !== null && subscriptionKey !== resolvedSubKey;
  const showLoadingOverlay = isLoadingSnapshot || isRefetching || isSavingProfile;

  const dataStaleMessage = disconnectDetail
    ? `Grid data is stale — ${disconnectDetail}. Edits are disabled until the connection is restored.`
    : undefined;

  // Event bridge + Custom Settings bindings host + the `provider:switched` /
  // `provider:dataStale` emits. Called here (not at the top) because it
  // reads the stale state declared just above.
  const { gridEventBindingsHost } = useContainerEventWiring({
    containerEventBus,
    handle: gridHandle,
    gridId: props.gridId,
    instanceId: props.instanceId ?? props.gridId,
    appId: props.appId,
    userId: props.userId,
    appData: appDataLookup,
    eventBindings,
    setEventBindings,
    gridEventHandlers,
    handlerMeta,
    selection,
    loaded,
    dataStale: providerDisconnected,
    dataStaleMessage,
  });

  useEffect(() => {
    setProviderDisconnected(false);
    setDisconnectDetail(undefined);
  }, [activeId]);

  // Render-time log of the gating inputs so you can see WHY the
  // subscribe effect isn't firing yet (or that it IS gated correctly
  // and waiting for the missing piece). Gated by `DEBUG` because this
  // fires on every render and the container does re-render frequently
  // when status/refreshTick/selection mutate.
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(
      `[v2/grid] render gate: loaded=%s liveApi=%s activeId=%s rowIdField=%s columnDefs=%s cfgLoaded=%s`,
      loaded, Boolean(liveApi), activeId, rowIdField, Boolean(columnDefs), Boolean(activeCfg),
    );
  }

  useProviderDataWiring<TData>({
    liveApi,
    provider,
    activeId,
    subscriptionKey,
    rowIdField,
    rowIdFieldKey,
    mode: selection.mode,
    asOfDate,
    toolbarDate,
    dataHubClient,
    restartProvider,
    onError,
    containerEventBus,
    setLoadRowCount,
    setProviderDisconnected,
    setDisconnectDetail,
    setResolvedSubKey,
    setIsRefetching,
  });

  /** Cache replay only — `IDataProvider.refresh()`; no upstream reconnect. */
  const refreshView = useCallback(() => {
    if (!activeId || !provider) return;
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log('[refresh] %c1. Refresh view clicked%c provider=%s (cache replay)',
        'color:#ec4899;font-weight:bold', '', activeId);
    }
    void refreshProvider().catch((err: unknown) => {
      (onError ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
    });
  }, [activeId, provider, refreshProvider, onError]);

  /** Full re-acquire — `IDataProvider.restart()` with toolbar extra payload. */
  const reloadFromSource = useCallback(async () => {
    if (!activeId || !provider) return;
    const asOfForRestart = selection.mode === 'historical'
      ? (asOfDate ?? (isHistoricalToolbarDate(toolbarDate) ? toolbarDate : null))
      : null;
    const extra = asOfForRestart
      ? { asOfDate: asOfForRestart }
      : { __refresh: Date.now() };
    if (
      selection.mode === 'historical'
      && asOfForRestart
      && historicalDateAppDataRef
    ) {
      const dot = historicalDateAppDataRef.indexOf('.');
      if (dot > 0) {
        const name = historicalDateAppDataRef.slice(0, dot);
        const key = historicalDateAppDataRef.slice(dot + 1);
        try {
          await appData.store.set(name, key, asOfForRestart);
        } catch (err: unknown) {
          (onError ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
          return;
        }
      }
    }
    const rawCfg = activeRow.cfg?.config;
    if (rawCfg && (rawCfg as { providerType?: string }).providerType === 'stomp') {
      traceStompProviderCfg(
        'MarketsGridContainer.reloadFromSource (main-thread audit; worker resolves on connect)',
        rawCfg as StompProviderConfig,
        {
          providerId: activeId,
          extra,
          lookup: (name, key) => appData.store.get(name, key),
        },
      );
    }
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log('[refresh] %c1. Reload from source clicked%c provider=%s mode=%s asOfDate=%s extra=%s',
        'color:#ec4899;font-weight:bold', '',
        activeId, selection.mode, asOfDate ?? '—', JSON.stringify(extra));
    }
    if (liveApi) {
      try {
        liveApi.flushAsyncTransactions();
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log(
            '[refresh] %c3a. flushAsyncTransactions drained old queue%c rows now %d',
            'color:#ec4899', '', liveApi.getDisplayedRowCount(),
          );
        }
        liveApi.setGridOption('rowData', []);
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.log('[refresh] %c3b. Grid cleared (setGridOption rowData=[])%c', 'color:#ec4899', '');
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[refresh]    Grid clear failed:', e);
      }
    }
    setIsRefetching(true);
    setLoadRowCount(undefined);
    setResolvedSubKey(null);
    void restartProvider(extra).catch((err: unknown) => {
      (onError ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
    });
  }, [activeId, provider, selection.mode, asOfDate, toolbarDate, liveApi, restartProvider, onError, activeRow.cfg, appData.store, historicalDateAppDataRef]);

  // Restart the active provider after toolbar date / mode changes.
  // Wait for `liveApi` so the provider wiring effect registers snapshot
  // listeners before `restart()` — otherwise the first historical snapshot
  // can arrive with no `onSnapshotData` handler attached.
  useEffect(() => {
    const pending = pendingToolbarReloadRef.current;
    if (!pending) return;
    if (!loaded || !provider || !activeId || !liveApi) return;
    // Fire only once the committed state matches the intent that queued this
    // reload. The ref is set synchronously in the handler, but the matching
    // toolbar date / mode / asOfDate updates commit a render later — an
    // unrelated render (e.g. `liveApi` flipping true from the grid's onReady)
    // can otherwise run this effect with stale state, consume the flag with a
    // live refresh, and skip the historical restart that carries `{ asOfDate }`.
    if (selection.mode !== pending.mode) return;
    if (pending.mode === 'historical' && asOfDate !== pending.asOfDate) return;
    pendingToolbarReloadRef.current = null;
    reloadFromSource();
  }, [
    loaded,
    provider,
    activeId,
    liveApi,
    selection.mode,
    asOfDate,
    toolbarDate,
    reloadFromSource,
  ]);

  const handleProviderEdit = useCallback((providerId: string | null) => {
    if (isOpenFin()) {
      onEditProvider?.(providerId);
      return;
    }
    setEditingProviderId(providerId);
    setProviderEditorOpen(true);
  }, [onEditProvider]);

  const handleOpenConfigBrowser = useCallback(() => {
    if (isOpenFin()) {
      onOpenConfigBrowser?.();
      return;
    }
    setConfigBrowserOpen(true);
  }, [onOpenConfigBrowser]);

  const userAdminActions = useMemo(
    () => (marketsGridProps as { adminActions?: AdminAction[] }).adminActions ?? [],
    [marketsGridProps],
  );

  const dataProviderInfraAdminActions = useMemo<AdminAction[]>(() => [
    {
      id: DATA_PROVIDER_EDITOR_ACTION_ID,
      label: 'Data Provider Editor',
      description: 'Edit provider configs, STOMP paths, and field mappings',
      icon: 'lucide:plug',
      onClick: () => handleProviderEdit(activeId ?? null),
    },
    createConfigBrowserAction({ launch: handleOpenConfigBrowser }),
  ], [activeId, handleProviderEdit, handleOpenConfigBrowser]);

  const providerGridHost = useMemo<ProviderGridHostApi>(() => ({
    available: true,
    liveProviders: liveList.configs,
    historicalProviders: histList.configs,
    liveProviderId: selection.liveProviderId,
    historicalProviderId: selection.historicalProviderId,
    mode: selection.mode,
    asOfDate,
    onLiveChange: setLiveId,
    onHistoricalChange: setHistoricalId,
    onModeChange: setMode,
    onAsOfDateChange: setAsOfDateAndPersist,
    onRefreshView: refreshView,
    onReloadFromSource: () => { void reloadFromSource(); },
    onEditProvider: handleProviderEdit,
  }), [
    liveList.configs,
    histList.configs,
    selection.liveProviderId,
    selection.historicalProviderId,
    selection.mode,
    asOfDate,
    setLiveId,
    setHistoricalId,
    setMode,
    setAsOfDateAndPersist,
    refreshView,
    reloadFromSource,
    handleProviderEdit,
  ]);

  const providerEditorDialog = (
    <ProviderEditorDialog
      open={providerEditorOpen}
      providerId={editingProviderId}
      userId={props.userId ?? LOGGED_IN_USER_ID}
      onOpenChange={(open) => {
        setProviderEditorOpen(open);
        if (!open) setEditingProviderId(null);
      }}
    />
  );

  const configBrowserDialog = (
    <ConfigBrowserDialog
      open={configBrowserOpen}
      onOpenChange={setConfigBrowserOpen}
    />
  );

  const dataDialogs = (
    <>
      {providerEditorDialog}
      {configBrowserDialog}
    </>
  );

  const refreshReloadAdminActions = useMemo<AdminAction[]>(() => [
    {
      id: 'refresh-view',
      label: 'Refresh view',
      description: activeProviderName
        ? `Replay cached rows for ${activeProviderName} without reconnecting`
        : 'Replay cached rows without reconnecting',
      icon: 'lucide:refresh-cw',
      onClick: refreshView,
    },
    {
      id: 'reload-from-source',
      label: 'Reload from source',
      description: activeProviderName
        ? `Restart ${activeProviderName} and re-fetch the snapshot`
        : 'Restart the active provider and re-fetch the snapshot',
      icon: 'lucide:rotate-cw',
      onClick: reloadFromSource,
    },
  ], [activeProviderName, refreshView, reloadFromSource]);

  const adminActionsWithDataInfra = useMemo(
    () => mergeAdminActions(refreshReloadAdminActions, dataProviderInfraAdminActions, userAdminActions),
    [refreshReloadAdminActions, dataProviderInfraAdminActions, userAdminActions],
  );

  const adminActionsInfraOnly = useMemo(
    () => mergeAdminActions([], dataProviderInfraAdminActions, userAdminActions),
    [dataProviderInfraAdminActions, userAdminActions],
  );

  // ── Render ────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <>
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          Loading…
        </div>
        {dataDialogs}
      </>
    );
  }

  // Provider id chosen but catalog row still loading — avoid mounting a
  // throwaway MarketsGrid shell (AG Grid + enterprise modules) that would
  // immediately unmount when cfg arrives.
  if (activeId && activeRow.loading) {
    return (
      <>
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          {activeProviderName
            ? `Loading ${activeProviderName}…`
            : 'Loading provider configuration…'}
        </div>
        {dataDialogs}
      </>
    );
  }

  // Provider selected and cfg loaded → full data-attached grid.
  if (activeId && !activeRow.loading && rowIdField && columnDefs) {
    return (
      <>
        <div style={{ position: 'relative', height: '100%', minHeight: 0 }}>
          <MarketsGrid<TData>
            {...(marketsGridProps as MarketsGridProps<TData>)}
            key={`${activeId}::${rowIdFieldKey}`}
            rowData={EMPTY as TData[]}
            rowIdField={rowIdField}
            columnDefs={columnDefs}
            appData={appDataLookup}
            onReady={onReady}
            providerGridHost={providerGridHost}
            gridEventBindingsHost={gridEventBindingsHost}
            adminActions={adminActionsWithDataInfra}
            caption={effectiveCaption}
            onCaptionChange={handleCaptionChange}
            onSavingChange={setIsSavingProfile}
            dataStale={providerDisconnected}
            dataStaleMessage={dataStaleMessage}
            historicalViewMode={isHistoricalView}
            historicalViewMessage={historicalViewMessage}
            toolbarDate={toolbarDate}
            onToolbarDateChange={handleToolbarDateChange}
            toolbarDateHistoryEnabled={toolbarDateHistoryEnabled}
          />
          {showLoadingOverlay && (
            <MarketsGridLoadingOverlay
              title={
                isSavingProfile
                  ? 'Saving…'
                  : isRefetching && resolvedSubKey
                    ? activeProviderName
                      ? `Refreshing ${activeProviderName}`
                      : 'Refreshing view'
                    : activeProviderName
                      ? `Loading ${activeProviderName}`
                      : 'Loading market data'
              }
              message={
                isSavingProfile
                  ? 'Persisting profile'
                  : isRefetching && resolvedSubKey
                    ? 'Replaying cached snapshot…'
                    : undefined
              }
              rowCount={isSavingProfile ? undefined : loadRowCount}
            />
          )}
        </div>
        {dataDialogs}
      </>
    );
  }

  // No provider selected, or cfg loaded but not data-ready (missing
  // key/columns): mount MarketsGrid with a sentinel rowIdField so Custom
  // Settings can pick or repair the provider.
  return (
    <>
      <MarketsGrid<TData>
        {...(marketsGridProps as MarketsGridProps<TData>)}
        key="__no_provider__"
        rowData={EMPTY as TData[]}
        rowIdField="__none__"
        columnDefs={EMPTY as unknown as ColDef<TData>[]}
        appData={appDataLookup}
        providerGridHost={providerGridHost}
        gridEventBindingsHost={gridEventBindingsHost}
        adminActions={adminActionsInfraOnly}
        caption={effectiveCaption}
        onCaptionChange={handleCaptionChange}
        toolbarDate={toolbarDate}
        onToolbarDateChange={handleToolbarDateChange}
        toolbarDateHistoryEnabled={toolbarDateHistoryEnabled}
      />
      {dataDialogs}
    </>
  );
}

function defaultOnError(err: Error): void {
  // eslint-disable-next-line no-console
  console.error('[MarketsGridContainer]', err);
}
