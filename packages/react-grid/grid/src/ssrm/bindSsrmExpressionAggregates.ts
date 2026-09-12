/**
 * Dataset-wide aggregates for SSRM expression evaluation.
 *
 * `SUM([col])` / `AVG` / `MIN` / `MAX` / `COUNT` normally expand via
 * `ctx.allRows` from `api.forEachNode`. Under SSRM that walk is the
 * loaded cache blocks, so `[col1] / SUM([col1])` would be a block
 * share, not a dataset share. Values come from
 * `ISsrmDataProvider.getAggregates` (same engine path as the status
 * bar) and are read synchronously from this session during valueGetter.
 */
import { SSRM_EXPR_AGG_KEY, type SsrmExprAggLookup } from '@wellsfargo-starui/core';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { GridApi } from 'ag-grid-community';
import { SSRM_COUNT_REFRESH_MS } from '../widget/useSsrmFilterCounts';

type SsrmAggFn = 'sum' | 'avg' | 'min' | 'max' | 'count';
type SsrmAggSpec = { column: string; fn: SsrmAggFn; as: string };

const EXPR_TO_SSRM: Record<string, SsrmAggFn> = {
  SUM: 'sum',
  AVG: 'avg',
  MIN: 'min',
  MAX: 'max',
  COUNT: 'count',
};

export interface SsrmExprAggSession extends SsrmExprAggLookup {
  stop(): void;
}

type ApiWithSession = GridApi & { [SSRM_EXPR_AGG_KEY]?: SsrmExprAggSession };

// No `quickFilterChanged`: AG Grid has no such event — quick filter updates
// arrive as the `filterChanged` this already listens for.
const GRID_EVENTS = [
  'filterChanged',
  'firstDataRendered',
] as const;

function readQuickFilter(api: GridApi): string | undefined {
  const raw = api.getGridOption?.('quickFilterText');
  return typeof raw === 'string' && raw ? raw : undefined;
}

function filterArgs(api: GridApi): {
  filterModel: Record<string, unknown> | null;
  quickFilterText?: string;
} {
  const filterModel = (api.getFilterModel?.() ?? null) as Record<string, unknown> | null;
  const quickFilterText = readQuickFilter(api);
  return quickFilterText ? { filterModel, quickFilterText } : { filterModel };
}

function valuesEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => a[k] === b[k]);
}

function specKey(column: string, fn: SsrmAggFn): string {
  return `${column}_${fn}`;
}

function refreshCells(api: GridApi): void {
  try {
    api.refreshCells?.({ force: true, suppressFlash: true });
  } catch {
    /* teardown */
  }
}

function startSession(provider: ISsrmDataProvider, api: GridApi): SsrmExprAggSession {
  const specs = new Map<string, SsrmAggSpec>();
  let values: Record<string, number> = {};
  let alive = true;
  let inFlight = false;
  let queued = false;

  const refresh = async (): Promise<void> => {
    if (!alive || specs.size === 0) return;
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    try {
      do {
        queued = false;
        const result = await provider.getAggregates({
          ...filterArgs(api),
          specs: [...specs.values()],
        }).catch(() => ({ values }));
        if (!alive) return;
        if (valuesEqual(values, result.values)) continue;
        values = result.values;
        refreshCells(api);
      } while (queued && alive);
    } finally {
      inFlight = false;
    }
  };

  const resolve = (fnName: string, columnId: string): unknown => {
    const fn = EXPR_TO_SSRM[fnName.toUpperCase()];
    if (!fn) return undefined;
    const as = specKey(columnId, fn);
    if (!specs.has(as)) {
      specs.set(as, { column: columnId, fn, as });
      void refresh();
    }
    return Object.prototype.hasOwnProperty.call(values, as) ? values[as] : null;
  };

  const onChange = (): void => { void refresh(); };
  const timer = setInterval(onChange, SSRM_COUNT_REFRESH_MS);
  type GridEvt = Parameters<GridApi['addEventListener']>[0];
  for (const evt of GRID_EVENTS) api.addEventListener?.(evt as GridEvt, onChange);
  const offTick = provider.onSsrmTick(onChange);
  const offRefresh = provider.onRefresh(onChange);

  return {
    resolve,
    stop: () => {
      alive = false;
      clearInterval(timer);
      for (const evt of GRID_EVENTS) api.removeEventListener?.(evt as GridEvt, onChange);
      offTick();
      offRefresh();
    },
  };
}

/** Attach a dataset-wide aggregate cache to `api`. Returns the unbind. */
export function bindSsrmExpressionAggregates(
  provider: ISsrmDataProvider,
  api: GridApi,
): () => void {
  const existing = (api as ApiWithSession)[SSRM_EXPR_AGG_KEY];
  existing?.stop();
  const session = startSession(provider, api);
  (api as ApiWithSession)[SSRM_EXPR_AGG_KEY] = session;
  return () => {
    session.stop();
    if ((api as ApiWithSession)[SSRM_EXPR_AGG_KEY] === session) {
      delete (api as ApiWithSession)[SSRM_EXPR_AGG_KEY];
    }
  };
}
