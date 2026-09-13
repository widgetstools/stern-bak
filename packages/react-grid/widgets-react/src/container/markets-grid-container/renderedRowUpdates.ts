/**
 * renderedRowUpdates — apply streaming UPDATES to a client-side AG Grid
 * without one transaction per row (refactor plan B1).
 *
 * Rows are patched in place before the grid hears about them (thin deltas:
 * the mirror row IS the node's data; full rows: the changed fields are
 * assigned onto it here), so the node is current and the grid only needs:
 *
 *   - rendered rows re-read: one `refreshCells({ rowNodes })` per flush window
 *     (`asyncTransactionWaitMillis`, the grid's MAX UPDATES / SEC), never with
 *     `force` — AG Grid refreshes and flashes only the cells whose value
 *     differs from what they last rendered;
 *   - rows whose POSITION or a GROUP AGGREGATE may have moved — a sort,
 *     filter, group or aggregated-value column changed value, the rule
 *     `bindSsrmTicks` applies for SSRM — still ride `applyTransactionAsync`,
 *     which is what AG Grid needs to re-sort / re-filter / re-aggregate along
 *     the changed path and to keep an in-progress edit alive;
 *   - the row-change bus told directly (`noteRowsChanged`) about the rows on
 *     the first path; the transaction path reaches it through
 *     `asyncTransactionsFlushed` as before.
 *
 * WHY (WORKLOG 21): a transaction per updated row fires `rowNodeDataChanged`
 * per row and every listener pays — 189 490 timers per 10 s on one docked
 * blotter before B0, 61 000 after. ~20 rendered rows a frame instead of
 * ~5 000 updated rows.
 *
 * Key-column change detection keeps, per node, the key values seen after
 * the previous tick (`api.getCellValue`, so value getters and calculated
 * columns count). A node with no snapshot yet — first touch after a sort /
 * filter / group change — rides a transaction once, which heals the snapshot
 * without a 20 000-row scan. Quick filter, pivot mode and the advanced
 * filter cannot be attributed to columns: while any is active every updated
 * row is a transaction, as before. An external filter is attributed through
 * the platform's `ExternalFilterColumns` registry (plan B2): its installer
 * declares the columns it reads and those become key columns; with nothing
 * declared it is unattributable like the others.
 */
import type { GridApi, IRowNode } from 'ag-grid-community';
import type { ExternalFilterColumns, RowChangeFeed } from '@wellsfargo-starui/core';

export interface RenderedRowUpdaterOptions {
  /** Row-change bus; resolved per call so a grid handle that arrives after the wiring effect still reaches it. */
  getRowChangeFeed?: () => RowChangeFeed | null | undefined;
  /** The platform's external-filter column declarations (`handle.platform.externalFilters`); resolved per call like the bus. */
  getExternalFilterColumns?: () => ExternalFilterColumns | null | undefined;
  /** Test seams for the flush timer. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export interface RenderedRowUpdater<TData> {
  /**
   * Apply updates for rows that already have a node. `ids[i]` is the row id of
   * `rows[i]`. Returns the rows that must still ride a transaction.
   */
  apply(api: GridApi<TData>, rows: readonly TData[], ids: readonly string[]): TData[];
  /** Forget snapshots and pending refreshes (row set replaced). */
  clear(): void;
  dispose(): void;
}

/** Columns whose value decides a row's position or a group aggregate; `all` when they cannot be attributed. */
export interface KeyColumns {
  readonly all: boolean;
  readonly cols: readonly string[];
  readonly signature: string;
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export function readKeyColumns<TData>(
  api: GridApi<TData>,
  externalFilters?: ExternalFilterColumns | null,
): KeyColumns {
  const quick = safe(() => api.getGridOption('quickFilterText'), undefined);
  const pivot = safe(() => api.isPivotMode(), false);
  const advanced = safe(() => api.getAdvancedFilterModel?.() ?? null, null);
  const isExternal = safe(() => api.getGridOption('isExternalFilterPresent'), undefined);
  const external = typeof isExternal === 'function' && safe(() => isExternal({ api } as never) === true, false);
  // An active external filter is attributable only through its installer's declaration.
  const declared = external ? safe(() => externalFilters?.columns() ?? null, null) : [];
  if ((typeof quick === 'string' && quick.length > 0) || pivot || advanced !== null || declared === null) {
    return { all: true, cols: [], signature: '*' };
  }
  const sort = safe(() => (api.getColumnState() ?? []).filter((c) => c.sort != null).map((c) => c.colId), [] as string[]);
  const filter = safe(() => Object.keys(api.getFilterModel() ?? {}), [] as string[]);
  const groups = safe(() => api.getRowGroupColumns().map((c) => c.getColId()), [] as string[]);
  const values = groups.length > 0 ? safe(() => api.getValueColumns().map((c) => c.getColId()), [] as string[]) : [];
  const cols = [...new Set([...sort, ...filter, ...groups, ...values, ...declared])];
  return { all: false, cols, signature: JSON.stringify(cols) };
}

/** Full-row providers deliver a new object per row: mirror the transaction's replace semantics onto the node's object. */
export function syncRowInPlace(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const k of Object.keys(source)) target[k] = source[k];
  for (const k of Object.keys(target)) if (!(k in source)) delete target[k];
}

function indexRendered<TData>(api: GridApi<TData>): Map<string, IRowNode<TData>> {
  const out = new Map<string, IRowNode<TData>>();
  for (const node of safe(() => api.getRenderedNodes(), [] as IRowNode<TData>[])) {
    if (node.id != null && node.data != null && !node.group) out.set(node.id, node);
  }
  return out;
}

function keyChanged<TData>(
  api: GridApi<TData>,
  node: IRowNode<TData>,
  id: string,
  cols: readonly string[],
  snapshot: Map<string, unknown[]>,
): boolean {
  const cur = cols.map((colKey) => safe(() => api.getCellValue({ rowNode: node, colKey }), undefined));
  const prev = snapshot.get(id);
  if (prev && prev.length === cur.length && prev.every((v, i) => Object.is(v, cur[i]))) return false;
  snapshot.set(id, cur);
  return true;
}

export function createRenderedRowUpdater<TData>(opts: RenderedRowUpdaterOptions = {}): RenderedRowUpdater<TData> {
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const keySnapshot = new Map<string, unknown[]>();
  const pendingRefresh = new Map<string, IRowNode<TData>>();
  let keySignature = '';
  let timer: unknown = null;
  let lastApi: GridApi<TData> | null = null;

  const flush = (): void => {
    timer = null;
    const api = lastApi;
    if (!api || pendingRefresh.size === 0) return;
    const rowNodes = [...pendingRefresh.values()];
    pendingRefresh.clear();
    // No `force`: AG Grid refreshes (and flashes) only cells whose value differs.
    safe(() => api.refreshCells({ rowNodes }), undefined);
  };

  const scheduleFlush = (api: GridApi<TData>): void => {
    if (timer !== null) return;
    const wait = safe(() => api.getGridOption('asyncTransactionWaitMillis'), undefined);
    timer = setTimer(flush, typeof wait === 'number' && wait > 0 ? wait : 0);
  };

  const apply = (api: GridApi<TData>, rows: readonly TData[], ids: readonly string[]): TData[] => {
    lastApi = api;
    const keys = readKeyColumns(api, opts.getExternalFilterColumns?.());
    if (keys.signature !== keySignature) {
      keySignature = keys.signature;
      keySnapshot.clear();
    }
    const rendered = indexRendered(api);
    const tx: TData[] = [];
    const changed: IRowNode<TData>[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const id = ids[i];
      const node = rendered.get(id) ?? safe(() => api.getRowNode(id), undefined) ?? null;
      if (!node || node.data == null) { tx.push(row); continue; }
      if (node.data !== row) syncRowInPlace(node.data as Record<string, unknown>, row as Record<string, unknown>);
      if (keys.all || (keys.cols.length > 0 && keyChanged(api, node, id, keys.cols, keySnapshot))) {
        tx.push(node.data);
        continue;
      }
      changed.push(node);
      if (rendered.has(id)) pendingRefresh.set(id, node);
    }
    if (changed.length > 0) {
      opts.getRowChangeFeed?.()?.noteRowsChanged(changed);
      if (pendingRefresh.size > 0) scheduleFlush(api);
    }
    return tx;
  };

  const clear = (): void => {
    pendingRefresh.clear();
    keySnapshot.clear();
    keySignature = '';
    if (timer !== null) { clearTimer(timer); timer = null; }
  };

  return {
    apply,
    clear,
    dispose() { clear(); lastApi = null; },
  };
}
