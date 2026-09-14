import type {
  GridApi,
  IServerSideDatasource,
  IServerSideGetRowsParams,
} from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { SsrmGetRowsRequest, SsrmGetRowsResult } from '@wellsfargo-starui/data/runtime';
import { ssrmViewKey, type SsrmBlockCache } from './SsrmBlockCache.js';

export interface CreateSsrmDatasourceOptions {
  getQuickFilterText?: () => string;
  /**
   * Engine computed columns riding every block request (plan §12 T3). Read
   * per request so a live edit to a calculated column takes effect on the
   * next block without rebuilding the datasource.
   */
  getComputedColumns?: () => readonly import('@wellsfargo-starui/data/runtime').SsrmComputedColumnSpec[];
  /**
   * Per-attempt ceiling on one block read. The worker RPC has its own
   * timeout, but a provider implementation may not — and a block that never
   * settles is a viewport that stays blank. Default 15 000 ms; 0 disables.
   */
  requestTimeoutMs?: number;
  /**
   * Attempts before the block is failed. AG Grid never retries a failed block
   * on its own, so a single transient worker hiccup would otherwise leave a
   * permanently blank block until the next purge. Default 3.
   */
  maxAttempts?: number;
  /** Base wait between attempts, multiplied by the attempt number. Default 250 ms. */
  retryBackoffMs?: number;
  /**
   * Block cache shared with `bindSsrmTicks`. A warm block is served in the
   * same frame the rows scroll in, so they paint once with data instead of
   * as stubs followed by a second render; the served block is re-read in
   * the background and any drifted row is patched in place.
   */
  cache?: SsrmBlockCache;
  /**
   * Blocks warmed ahead in the scroll direction after each served block.
   * Default 1; 0 disables. Needs `cache`.
   */
  prefetchBlocks?: number;
  /**
   * Hold block reads while the provider reports `loading`, so the first
   * paint is the snapshot rather than an empty grid with a row count of
   * zero that a purge then replaces. Default 60 000 ms; 0 disables.
   */
  readyTimeoutMs?: number;
}

export const SSRM_REQUEST_TIMEOUT_MS = 15_000;
export const SSRM_MAX_ATTEMPTS = 3;
export const SSRM_RETRY_BACKOFF_MS = 250;
export const SSRM_READY_TIMEOUT_MS = 60_000;

type FilterModel = Record<string, unknown>;
type Row = Record<string, unknown>;
type RowIdFn = (params: { data: unknown; level: number; parentKeys: string[] }) => string;

interface FilterSlot {
  filterType?: string;
  values?: unknown;
  filterModels?: unknown[];
}

function asSlot(entry: unknown): FilterSlot | null {
  return entry && typeof entry === 'object' ? (entry as FilterSlot) : null;
}

/** A Set Filter slot — declared, or implied by a bare `values` array. */
function isSetSlot(entry: unknown): boolean {
  const e = asSlot(entry);
  if (!e) return false;
  return e.filterType === 'set' || (e.filterType === undefined && Array.isArray(e.values));
}

/**
 * Set filters with no selected values mean "match nothing" in AG Grid.
 * Under SSRM the values callback often hasn't landed on the first request
 * (or is cached empty after a failed load-time lookup), so the request
 * arrives as `{ filterType: 'set', values: [] }`. Sending that to the
 * engine zeroes the grouped view — deactivate the pill and groups appear,
 * apply it again and they vanish. Drop those slots; a real selection has
 * a non-empty `values` array.
 */
function isEmptySetSlot(entry: unknown): boolean {
  const e = asSlot(entry);
  if (!e) return false;
  if (e.filterType === 'multi' && Array.isArray(e.filterModels)) {
    return e.filterModels.every((slot) => slot == null || isEmptySetSlot(slot));
  }
  return isSetSlot(entry) && Array.isArray(e.values) && e.values.length === 0;
}

/**
 * Rebuild a filter model with some slots removed. Multi-filter slots are
 * nulled rather than spliced so the remaining sub-filters keep their index;
 * a column whose every slot went is dropped; an empty model becomes `null`.
 */
function pruneSlots(
  model: FilterModel | null | undefined,
  drop: (slot: unknown) => boolean,
): FilterModel | null {
  if (!model) return null;
  const out: FilterModel = {};
  let kept = false;
  for (const [col, entry] of Object.entries(model)) {
    if (drop(entry)) continue;
    const e = asSlot(entry);
    if (e && e.filterType === 'multi' && Array.isArray(e.filterModels)) {
      const slots = e.filterModels.map((slot) => (slot != null && drop(slot) ? null : slot));
      if (slots.every((slot) => slot == null)) continue;
      out[col] = { ...e, filterModels: slots };
    } else {
      out[col] = entry;
    }
    kept = true;
  }
  return kept ? out : null;
}

const withoutEmptySetFilters = (model: FilterModel | null | undefined): FilterModel | null =>
  pruneSlots(model, isEmptySetSlot);

const withoutSetFilters = (model: FilterModel | null | undefined): FilterModel | null =>
  pruneSlots(model, isSetSlot);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[ssrm] ${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err: unknown) => { clearTimeout(timer); reject(err); },
    );
  });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function readBlock(
  provider: ISsrmDataProvider,
  req: SsrmGetRowsRequest,
  opts: { timeoutMs: number; maxAttempts: number; backoffMs: number },
  destroyed: () => boolean,
): Promise<SsrmGetRowsResult> {
  const label = `block ${req.startRow ?? 0}-${req.endRow ?? '?'}`;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await withTimeout(provider.getRows(req), opts.timeoutMs, label);
    } catch (err) {
      if (attempt >= opts.maxAttempts || destroyed()) throw err;
      // eslint-disable-next-line no-console
      console.warn(`[ssrm] ${label} attempt ${attempt} failed — retrying`, err);
      await sleep(opts.backoffMs * attempt);
    }
  }
}

function shallowEqualRow(a: Row, b: Row): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

function rowIdFrom(api: GridApi | undefined): (row: Row) => string | undefined {
  let fn: RowIdFn | undefined;
  try {
    fn = api?.getGridOption?.('getRowId') as RowIdFn | undefined;
  } catch {
    fn = undefined;
  }
  return (row) => {
    if (fn) {
      try {
        return String(fn({ data: row, level: 0, parentKeys: [] }));
      } catch {
        return undefined;
      }
    }
    return row.id == null ? undefined : String(row.id);
  };
}

export function createSsrmDatasource(
  provider: ISsrmDataProvider,
  options: CreateSsrmDatasourceOptions = {},
): IServerSideDatasource {
  const readOpts = {
    timeoutMs: options.requestTimeoutMs ?? SSRM_REQUEST_TIMEOUT_MS,
    maxAttempts: Math.max(1, options.maxAttempts ?? SSRM_MAX_ATTEMPTS),
    backoffMs: options.retryBackoffMs ?? SSRM_RETRY_BACKOFF_MS,
  };
  const cache = options.cache;
  const prefetchBlocks = cache ? Math.max(0, options.prefetchBlocks ?? 1) : 0;
  const readyTimeoutMs = options.readyTimeoutMs ?? SSRM_READY_TIMEOUT_MS;

  // The first block must land without SET filters. AG Grid (and grid-state
  // restore) can put a set-filter model on the request before the values
  // callback has answered; a grouped store then waits on values / receives
  // `in: []` and never shows a group. Text / number / date conditions and the
  // quick filter have no such dependency and ride the first block, so a
  // restored filter paints — and counts — correctly from the first paint.
  // After that first success, later requests carry the live filter,
  // including the pill applied from firstDataRendered.
  let firstBlockDone = false;
  let lastStart = 0;
  const inflight = new Map<string, Promise<SsrmGetRowsResult>>();
  let idOf: ((row: Row) => string | undefined) | null = null;

  // A dropped condition shows MORE rows than the filter asks for, which looks
  // like working software. Say so once per distinct set of conditions.
  const warnedUnsupported = new Set<string>();
  const warnUnsupported = (list: readonly string[]): void => {
    const key = list.join('|');
    if (warnedUnsupported.has(key)) return;
    warnedUnsupported.add(key);
    // eslint-disable-next-line no-console
    console.warn(
      '[ssrm] the engine could not apply these filter conditions; the grid shows MORE rows than the filter asks for:',
      list,
    );
  };

  // Hold reads while the snapshot is still streaming into the engine. A
  // provider that cannot say (no `status`) is not held.
  let readyGate: Promise<void> | null = null;
  const waitReady = (): Promise<void> => {
    if (readyTimeoutMs <= 0 || provider.status !== 'loading') return Promise.resolve();
    if (!readyGate) {
      readyGate = new Promise<void>((resolve) => {
        let off: () => void = () => undefined;
        let settled = false;
        const done = (): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          off();
          readyGate = null;
          resolve();
        };
        const timer = setTimeout(done, readyTimeoutMs);
        off = provider.onStatus((status) => {
          if (status !== 'loading') done();
        });
      });
    }
    return readyGate;
  };

  const blockKey = (viewKey: string, start: number): string => `${viewKey}#${start}`;

  /** One read per (view, block) at a time — a prefetch and a real request share it. */
  const load = (
    req: SsrmGetRowsRequest,
    viewKey: string,
    start: number,
    destroyed: () => boolean,
  ): Promise<SsrmGetRowsResult> => {
    const key = blockKey(viewKey, start);
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = waitReady()
      .then(() => readBlock(provider, req, readOpts, destroyed))
      .then((result) => {
        if (cache && idOf) cache.set(viewKey, start, result, idOf);
        return result;
      })
      .finally(() => { inflight.delete(key); });
    inflight.set(key, p);
    return p;
  };

  const prefetch = (
    api: GridApi,
    req: SsrmGetRowsRequest,
    viewKey: string,
    start: number,
    blockSize: number,
    rowCount: number,
  ): void => {
    if (!cache || prefetchBlocks === 0) return;
    const dir = start >= lastStart ? 1 : -1;
    const destroyed = (): boolean => api.isDestroyed?.() === true;
    for (let i = 1; i <= prefetchBlocks; i += 1) {
      const s = start + dir * i * blockSize;
      if (s < 0 || (rowCount >= 0 && s >= rowCount)) break;
      if (cache.has(viewKey, s) || inflight.has(blockKey(viewKey, s))) continue;
      void load({ ...req, startRow: s, endRow: s + blockSize }, viewKey, s, destroyed)
        .catch(() => undefined);
    }
  };

  /** Re-read a block served from cache and patch rows that drifted since. */
  const revalidate = (
    api: GridApi,
    req: SsrmGetRowsRequest,
    viewKey: string,
    start: number,
    served: SsrmGetRowsResult,
  ): void => {
    if (!cache || !idOf) return;
    const id = idOf;
    const destroyed = (): boolean => api.isDestroyed?.() === true;
    void load(req, viewKey, start, destroyed)
      .then((fresh) => {
        if (destroyed()) return;
        const servedById = new Map<string, Row>();
        for (const row of served.rowData) {
          const rid = id(row as Row);
          if (rid !== undefined) servedById.set(rid, row as Row);
        }
        // Same id, different values → patch in place. Rows that moved between
        // blocks are the tick binder's positional refresh to handle; the
        // cache already holds the fresh block for the next read.
        const update = (fresh.rowData as Row[]).filter((row) => {
          const rid = id(row);
          const old = rid === undefined ? undefined : servedById.get(rid);
          return old !== undefined && !shallowEqualRow(old, row);
        });
        if (update.length > 0) {
          try {
            api.applyServerSideTransactionAsync({ update });
          } catch { /* destroyed */ }
        }
      })
      .catch(() => undefined);
  };

  return {
    getRows(params: IServerSideGetRowsParams): void {
      const base = params.request as unknown as SsrmGetRowsRequest;
      const quickFilterText = options.getQuickFilterText?.() ?? '';
      const filterModel = firstBlockDone
        ? withoutEmptySetFilters(base.filterModel)
        : withoutSetFilters(base.filterModel);
      const computedColumns = options.getComputedColumns?.() ?? [];
      const req: SsrmGetRowsRequest = {
        ...base,
        filterModel,
        ...(quickFilterText ? { quickFilterText } : {}),
        ...(computedColumns.length > 0 ? { computedColumns } : {}),
      };
      if (!quickFilterText) delete req.quickFilterText;

      const api = params.api;
      const destroyed = (): boolean => api.isDestroyed?.() === true;
      const start = req.startRow ?? 0;
      const blockSize = Math.max(1, (req.endRow ?? start + 1) - start);
      const viewKey = cache ? ssrmViewKey(req) : '';
      if (cache && !idOf) idOf = rowIdFrom(api);

      const deliver = (result: SsrmGetRowsResult): void => {
        if (destroyed()) return;
        firstBlockDone = true;
        if (result.unsupportedFilters?.length) warnUnsupported(result.unsupportedFilters);
        params.success({
          rowData: [...result.rowData],
          rowCount: result.rowCount,
          grandTotalData: result.grandTotalData,
          pivotResultFields: result.pivotResultFields,
          ...(result.groupData ? { groupLevelInfo: result.groupData } : {}),
        });
      };

      const hit = cache?.get(viewKey, start);
      if (hit) {
        // Same frame as the stub rows AG Grid just created — they paint with
        // data before the browser gets to draw them empty.
        queueMicrotask(() => deliver(hit));
        revalidate(api, req, viewKey, start, hit);
        prefetch(api, req, viewKey, start, blockSize, hit.rowCount);
        lastStart = start;
        return;
      }

      load(req, viewKey, start, destroyed)
        .then((result) => {
          deliver(result);
          prefetch(api, req, viewKey, start, blockSize, result.rowCount);
        })
        .catch((err: unknown) => {
          if (destroyed()) return;
          // eslint-disable-next-line no-console
          console.error('[ssrm] getRows failed', err);
          params.fail();
        });
      lastStart = start;
    },
    destroy(): void {
      cache?.clear();
      /* Session detach is owned by ISsrmDataProvider.stop() / the React hook. */
    },
  };
}
