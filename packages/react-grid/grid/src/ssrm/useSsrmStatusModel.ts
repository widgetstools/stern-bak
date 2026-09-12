/**
 * Provider-backed numbers for the SSRM status bar.
 *
 * CSRM's built-in panels walk row nodes. Under SSRM those nodes are the
 * loaded blocks, so "Total Rows" would read as the cache block size. Counts
 * and aggregations come from the engine instead, polled at the same cadence
 * as the saved-filter pills so a live feed stays honest without opening a
 * view per tick.
 *
 * Every panel on the bar calls this hook. One grid shares one poll — five
 * panels must not open five views a second.
 */
import { useEffect, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { SSRM_COUNT_REFRESH_MS } from '../widget/useSsrmFilterCounts';
import {
  countGroupSelection,
  isGroupSelectionState,
  leafCountLookupFromApi,
} from './ssrmGroupSelection.js';

const AGG_FUNCS = ['count', 'sum', 'min', 'max', 'avg'] as const;

export interface SsrmStatusModel {
  total: number;
  filtered: number;
  selected: number;
  /** `column_fn` → value, matching the engine's `as` keys. */
  aggregates: Record<string, number>;
  aggregateColumn: string | null;
  /**
   * False until the engine has answered a count at least once. Panels render
   * a dash instead of the confidently-wrong `0` the EMPTY model would show —
   * the trap the Rust plan calls out for status bars.
   */
  loaded: boolean;
}

const EMPTY: SsrmStatusModel = {
  total: 0,
  filtered: 0,
  selected: 0,
  aggregates: {},
  aggregateColumn: null,
  loaded: false,
};

type Listener = (model: SsrmStatusModel) => void;

interface Session {
  provider: ISsrmDataProvider;
  listeners: Set<Listener>;
  model: SsrmStatusModel;
  stop: () => void;
}

const sessions = new WeakMap<GridApi, Session>();

function modelsEqual(a: SsrmStatusModel, b: SsrmStatusModel): boolean {
  if (a.total !== b.total || a.filtered !== b.filtered || a.selected !== b.selected) return false;
  if (a.aggregateColumn !== b.aggregateColumn || a.loaded !== b.loaded) return false;
  const keys = Object.keys(a.aggregates);
  if (keys.length !== Object.keys(b.aggregates).length) return false;
  return keys.every((k) => a.aggregates[k] === b.aggregates[k]);
}

function selectedColumn(api: GridApi): string | null {
  const ranges = api.getCellRanges?.() ?? [];
  for (const range of ranges) {
    for (const col of range.columns ?? []) {
      const id = col.getColId?.();
      if (id && id !== 'ag-Grid-AutoColumn') return id;
    }
  }
  const values = api.getValueColumns?.() ?? [];
  return values[0]?.getColId?.() ?? null;
}

/**
 * Under SSRM a header select-all is server-side selection state, not a set of
 * selected nodes: `getSelectedNodes` sees only the loaded blocks (or nothing
 * at all once `selectAll` is set). Count from the state — `selectAll` with
 * exclusions is the filtered total minus the toggled ids; otherwise the
 * toggled ids ARE the selection. Group-selection state (a `groupSelects`
 * tree) is counted through the loaded group rows' engine `__count`s; only
 * when a toggled group's row is not loaded does this fall back to the walk.
 */
function selectedCount(api: GridApi, filtered: number): number {
  const state = api.getServerSideSelectionState?.() as
    | { selectAll?: boolean; toggledNodes?: unknown[] }
    | null
    | undefined;
  if (
    state
    && typeof state.selectAll === 'boolean'
    && Array.isArray(state.toggledNodes)
    && state.toggledNodes.every((id) => typeof id === 'string')
  ) {
    const toggled = state.toggledNodes.length;
    return state.selectAll ? Math.max(0, filtered - toggled) : toggled;
  }
  if (isGroupSelectionState(state)) {
    const counted = countGroupSelection(state, filtered, leafCountLookupFromApi(api));
    if (counted !== null) return counted;
  }
  return api.getSelectedNodes?.()?.length ?? 0;
}

function readQuickFilter(api: GridApi): string | undefined {
  const raw = api.getGridOption?.('quickFilterText');
  return typeof raw === 'string' && raw ? raw : undefined;
}

function filterArgs(
  filterModel: Record<string, unknown> | null,
  quickFilterText: string | undefined,
): { filterModel: Record<string, unknown> | null; quickFilterText?: string } {
  return quickFilterText ? { filterModel, quickFilterText } : { filterModel };
}

async function loadModel(
  provider: ISsrmDataProvider,
  api: GridApi,
  prev: SsrmStatusModel,
): Promise<SsrmStatusModel> {
  const filterModel = (api.getFilterModel?.() ?? null) as Record<string, unknown> | null;
  const filteredReq = filterArgs(filterModel, readQuickFilter(api));
  const column = selectedColumn(api);
  const specs = column
    ? AGG_FUNCS.map((fn) => ({ column, fn, as: `${column}_${fn}` }))
    : [];
  const [total, filtered, aggregates] = await Promise.all([
    provider.getRowCount({}).then((r) => r.rowCount).catch(() => null),
    provider.getRowCount(filteredReq).then((r) => r.rowCount).catch(() => null),
    specs.length === 0
      ? Promise.resolve({ values: prev.aggregates })
      : provider.getAggregates({ ...filteredReq, specs }).catch(() => ({ values: prev.aggregates })),
  ]);
  const filteredCount = filtered ?? prev.filtered;
  return {
    total: total ?? prev.total,
    filtered: filteredCount,
    selected: selectedCount(api, filteredCount),
    aggregates: aggregates.values,
    aggregateColumn: column,
    // Loaded only once a count RPC has actually answered — a failed first
    // poll keeps the dash rather than promoting EMPTY's zeros to numbers.
    loaded: prev.loaded || total !== null || filtered !== null,
  };
}

function startSession(provider: ISsrmDataProvider, api: GridApi): Session {
  const session: Session = {
    provider,
    listeners: new Set(),
    model: EMPTY,
    stop: () => undefined,
  };
  let alive = true;
  let inFlight = false;

  const publish = (next: SsrmStatusModel): void => {
    if (modelsEqual(session.model, next)) return;
    session.model = next;
    for (const listener of session.listeners) listener(next);
  };

  const refresh = async (): Promise<void> => {
    if (inFlight || !alive) return;
    inFlight = true;
    try {
      publish(await loadModel(provider, api, session.model));
    } finally {
      inFlight = false;
    }
  };

  const onChange = (): void => { void refresh(); };

  // The engine only changes between ticks, so the cadence poll runs ONLY
  // when one arrived since the last read — an idle blotter costs zero RPCs.
  // Grid-side changes (filter, selection) refresh immediately below.
  let tickDirty = false;
  const markDirty = (): void => { tickDirty = true; };
  // Optional-called so partial test doubles without the listeners still work.
  const offTick = provider.onSsrmTick?.(markDirty) ?? ((): void => undefined);
  const offRefresh = provider.onRefresh?.(markDirty) ?? ((): void => undefined);
  const offStatus = provider.onStatus?.(markDirty) ?? ((): void => undefined);

  void refresh();
  const timer = setInterval(() => {
    // Keep retrying while the bar still shows dashes — a failed first poll
    // on an idle feed would otherwise never be retried (no tick, no retry).
    if (!tickDirty && session.model.loaded) return;
    tickDirty = false;
    onChange();
  }, SSRM_COUNT_REFRESH_MS);
  // No `quickFilterChanged` here: AG Grid has no such event — quick filter
  // updates arrive as the `filterChanged` this already listens for.
  const events = [
    'filterChanged',
    'selectionChanged',
    'cellSelectionChanged',
    'firstDataRendered',
  ] as const;
  type GridEvt = Parameters<GridApi['addEventListener']>[0];
  for (const evt of events) api.addEventListener?.(evt as GridEvt, onChange);
  session.stop = () => {
    alive = false;
    clearInterval(timer);
    offTick();
    offRefresh();
    offStatus();
    for (const evt of events) api.removeEventListener?.(evt as GridEvt, onChange);
  };
  return session;
}

function subscribe(provider: ISsrmDataProvider, api: GridApi, listener: Listener): () => void {
  let session = sessions.get(api);
  if (!session || session.provider !== provider) {
    session?.stop();
    session = startSession(provider, api);
    sessions.set(api, session);
  }
  const active = session;
  active.listeners.add(listener);
  listener(active.model);
  return () => {
    active.listeners.delete(listener);
    if (active.listeners.size === 0) {
      active.stop();
      if (sessions.get(api) === active) sessions.delete(api);
    }
  };
}

export function useSsrmStatusModel(
  provider: ISsrmDataProvider | undefined,
  api: GridApi | undefined,
): SsrmStatusModel {
  const [model, setModel] = useState<SsrmStatusModel>(EMPTY);

  useEffect(() => {
    if (!provider || !api) return undefined;
    return subscribe(provider, api, setModel);
  }, [provider, api]);

  return model;
}
