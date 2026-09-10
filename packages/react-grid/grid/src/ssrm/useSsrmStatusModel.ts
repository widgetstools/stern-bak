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

const AGG_FUNCS = ['count', 'sum', 'min', 'max', 'avg'] as const;

export interface SsrmStatusModel {
  total: number;
  filtered: number;
  selected: number;
  /** `column_fn` → value, matching the engine's `as` keys. */
  aggregates: Record<string, number>;
  aggregateColumn: string | null;
}

const EMPTY: SsrmStatusModel = {
  total: 0,
  filtered: 0,
  selected: 0,
  aggregates: {},
  aggregateColumn: null,
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
  if (a.aggregateColumn !== b.aggregateColumn) return false;
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

function selectedCount(api: GridApi): number {
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
    provider.getRowCount({}).then((r) => r.rowCount).catch(() => prev.total),
    provider.getRowCount(filteredReq).then((r) => r.rowCount).catch(() => prev.filtered),
    specs.length === 0
      ? Promise.resolve({ values: prev.aggregates })
      : provider.getAggregates({ ...filteredReq, specs }).catch(() => ({ values: prev.aggregates })),
  ]);
  return {
    total,
    filtered,
    selected: selectedCount(api),
    aggregates: aggregates.values,
    aggregateColumn: column,
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
  void refresh();
  const timer = setInterval(onChange, SSRM_COUNT_REFRESH_MS);
  const events = [
    'filterChanged',
    'selectionChanged',
    'cellSelectionChanged',
    'firstDataRendered',
    'quickFilterChanged',
  ] as const;
  type GridEvt = Parameters<GridApi['addEventListener']>[0];
  for (const evt of events) api.addEventListener?.(evt as GridEvt, onChange);
  session.stop = () => {
    alive = false;
    clearInterval(timer);
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
