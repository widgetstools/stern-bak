/**
 * AG Grid server-side datasource backed by a Perspective View.
 *
 * The book lives once as a Table in the SharedWorker; this datasource
 * serves the blocks AG Grid asks for by reading a window out of a View.
 * Measured on 4.5.2, a 100-row window read is ~2-6ms and is FLAT with
 * scroll depth — which is the whole reason for the engine swap. The
 * client-side row model has to materialize all 20k rows x 52 columns in
 * every window.
 *
 * The rules encoded below come from decoding the shipped ag-grid-enterprise
 * bundle; the public docs are silent on all of them, and violating any one
 * fails SILENTLY rather than throwing.
 *
 * The AG shapes are declared STRUCTURALLY rather than imported: nothing under
 * `perspective-grid/` may depend on AG Grid, so the engine can be unit-tested
 * without a grid and without a DOM.
 */

/** Minimal shape of the Perspective View methods this datasource needs. */
export interface PerspectiveViewLike {
  to_columns(window?: {
    start_row?: number;
    end_row?: number;
  }): Promise<Record<string, unknown[]>>;
  num_rows(): Promise<number>;
}

/** The slice of AG Grid's `IServerSideGetRowsRequest` we consume. */
export interface ServerSideRequestLike {
  startRow?: number;
  endRow?: number;
  sortModel?: readonly { colId: string; sort: string }[];
  filterModel?: unknown;
  /** Columns being grouped by, outermost first. */
  rowGroupCols?: readonly { id: string; field?: string; displayName?: string }[];
  /** Columns being aggregated, with the AG aggregate name. */
  valueCols?: readonly { id: string; field?: string; aggFunc?: string | null }[];
  /**
   * Keys of the ancestors of the level being asked for; its length IS the
   * depth. `[]` is the root level, `['Energy']` asks for the children of the
   * Energy group. AG Grid pulls one level at a time — it never asks for a
   * whole tree — which is why a Perspective view backing a request groups by
   * exactly ONE column and pushes the ancestor keys into its filter.
   */
  groupKeys?: readonly unknown[];
}

export interface ServerSideGetRowsParamsLike {
  request: ServerSideRequestLike;
  /**
   * AG's hint that it holds no cached grand total — true on first load and
   * after any filter or aggregation change that purged it. Documented as a
   * hint only: supplying `grandTotalData` when it is false UPDATES the
   * existing grand total row, which is what keeps the total live under a feed.
   */
  needsGrandTotal?: boolean;
  success(result: {
    rowData: Record<string, unknown>[];
    rowCount?: number;
    /** The grid assigns this row's id itself (`GRAND_TOTAL_ROW_ID`). */
    grandTotalData?: Record<string, unknown> | null;
  }): void;
  fail(): void;
}

/**
 * Pivot Perspective's columnar window into the row objects AG Grid wants.
 *
 * `to_columns` returns `{ col: [v0, v1, ...] }`. Row count is taken from the
 * longest column rather than any single one, so a column that is entirely
 * null in this window cannot silently truncate the block.
 */
export function columnsToRows(
  columns: Record<string, unknown[]>,
): Record<string, unknown>[] {
  const names = Object.keys(columns);
  if (names.length === 0) return [];

  let length = 0;
  for (const name of names) {
    const col = columns[name];
    if (Array.isArray(col) && col.length > length) length = col.length;
  }

  const rows: Record<string, unknown>[] = new Array(length);
  for (let i = 0; i < length; i++) {
    const row: Record<string, unknown> = {};
    for (const name of names) row[name] = columns[name]?.[i];
    rows[i] = row;
  }
  return rows;
}

/**
 * Snapshot the mutable parts of an AG Grid request.
 *
 * `sortModel` / `filterModel` / `rowGroupCols` / `valueCols` are references
 * into ONE shared params object that AG mutates in place. Retaining them by
 * reference corrupts the `oldSortModel` that `findChangedColumnsInSort` diffs
 * against, which yields an empty `changedColumns` and silently stops
 * refresh-on-sort at group levels. Anything we keep past the synchronous call
 * must be cloned — and the group fields especially, since they are what the
 * group levels are rebuilt from.
 */
export function cloneRequest(request: ServerSideRequestLike): ServerSideRequestLike {
  return {
    startRow: request.startRow,
    endRow: request.endRow,
    sortModel: request.sortModel?.map((s) => ({ colId: s.colId, sort: s.sort })),
    filterModel:
      request.filterModel === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(request.filterModel)) as unknown),
    rowGroupCols: request.rowGroupCols?.map((c) => ({
      id: c.id,
      field: c.field,
      displayName: c.displayName,
    })),
    valueCols: request.valueCols?.map((c) => ({
      id: c.id,
      field: c.field,
      aggFunc: c.aggFunc,
    })),
    groupKeys: request.groupKeys === undefined ? undefined : [...request.groupKeys],
  };
}

export interface PerspectiveDatasourceOpts {
  /** Resolve the View to read — re-resolved per block so sort/filter swaps are picked up. */
  getView(request: ServerSideRequestLike): Promise<PerspectiveViewLike | null>;
  /** Optional generation fence; a block whose generation is stale resolves empty, never silently. */
  getGeneration?(): number;
  /**
   * Supply the grand total row. Called for ROOT-level requests only (AG has
   * exactly one grand total, and only a root-level load can carry it).
   *
   * Called on every root block rather than only when `needsGrandTotal` is set,
   * because a live feed has to keep the total moving and AG accepts an update
   * at any time. Perspective makes this nearly free: a grouped View's row 0 is
   * already the grand total, so it is a one-row read from a View the grid is
   * pulling anyway.
   */
  getGrandTotal?(request: ServerSideRequestLike): Promise<Record<string, unknown> | null>;
  onError?(err: unknown): void;
}

export interface PerspectiveDatasource {
  getRows(params: ServerSideGetRowsParamsLike): void;
}

/**
 * Build the datasource.
 *
 * RULE 1 (the one that matters): every `getRows` terminates in EXACTLY one
 * `success` or `fail`. AG Grid increments a grid-global `outboundRequests`
 * counter before calling us and only decrements it inside success/fail, with
 * `maxConcurrentDatasourceRequests` defaulting to 2. Two leaked calls and
 * `hasAvailableLoadBandwidth()` is false forever — no request is ever issued
 * again, for any store, for any reason, and purging does NOT recover it.
 * So there is no early `return` anywhere below: stale generations and null
 * views still resolve, they just resolve empty. Delivering a stale block is
 * safe (a dead cache discards it via `!live`); failing to resolve is fatal.
 */
export function createPerspectiveDatasource(
  opts: PerspectiveDatasourceOpts,
): PerspectiveDatasource {
  return {
    getRows(params: ServerSideGetRowsParamsLike): void {
      const request = cloneRequest(params.request);
      const startRow = request.startRow ?? 0;
      const endRow = request.endRow ?? startRow;
      const generation = opts.getGeneration?.();

      void (async () => {
        try {
          const view = await opts.getView(request);

          // Stale fence or no view: resolve EMPTY rather than returning.
          // `rowCount` is omitted so AG keeps `isLastRowKnown` false —
          // passing 0 here would permanently cap the store (rule 2).
          if (
            view === null ||
            (generation !== undefined && opts.getGeneration?.() !== generation)
          ) {
            params.success({ rowData: [] });
            return;
          }

          const columns = await view.to_columns({
            start_row: startRow,
            end_row: endRow,
          });
          const rowData = columnsToRows(columns);

          /**
           * Report the EXACT total on every block.
           *
           * Perspective knows it — `num_rows()` on the View being read — and
           * it is effectively free. Without it AG never learns the size of the
           * book: a block that arrives with no `rowCount` leaves
           * `lastRowIndexKnown: false` and the store sizes itself to what has
           * loaded, so the scrollbar spans ~125 rows of a 20,000-row book and
           * grows a block at a time as you drag. Measured on the real feed:
           * `rowCount: 102, lastRowIndexKnown: false`. Sending it makes the
           * thumb map to the whole dataset, which is what a blotter needs.
           *
           * This does NOT contradict "empty resolutions omit rowCount" — that
           * rule is about never FABRICATING a total (a forced 0 or a
           * too-small guess caps the store permanently). A measured count is
           * the opposite: it is the number AG is otherwise trying to discover
           * by walking off the end.
           */
          let rowCount: number | undefined;
          try {
            const total = await view.num_rows();
            if (Number.isFinite(total)) rowCount = total;
          } catch {
            // A missing total must never cost the block; fall through to the
            // short-block signal below.
          }

          if (rowCount === undefined && rowData.length < endRow - startRow) {
            // No measured total, but the block came up short — that is AG's
            // own signal for the end of the book.
            rowCount = startRow + rowData.length;
          }

          const result: {
            rowData: Record<string, unknown>[];
            rowCount?: number;
            grandTotalData?: Record<string, unknown> | null;
          } = rowCount === undefined ? { rowData } : { rowData, rowCount };

          // A missing total must never cost the block: this is a separate
          // try/catch so a failure here still settles the rows (rule 1).
          if (opts.getGrandTotal && !request.groupKeys?.length) {
            try {
              const grandTotalData = await opts.getGrandTotal(request);
              if (grandTotalData) result.grandTotalData = grandTotalData;
            } catch (err) {
              opts.onError?.(err);
            }
          }

          params.success(result);
        } catch (err) {
          opts.onError?.(err);
          // Failed blocks are never retried automatically — the caller must
          // use `api.retryServerSideLoads()` — but failing is still the only
          // way to release the bandwidth counter.
          params.fail();
        }
      })();
    },
  };
}
