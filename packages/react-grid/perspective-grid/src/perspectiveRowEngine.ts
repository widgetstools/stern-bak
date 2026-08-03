/**
 * The row engine: everything a grid needs to run on a worker-held Table.
 *
 * `createPerspectiveDatasource` answers one block, and `createViewManager`
 * decides which View that block reads from. This binds the two to a live grid —
 * the parts that were previously re-hand-written per page and are easy to get
 * subtly wrong:
 *
 *   - refreshing EVERY expanded group level, not just the root;
 *   - keeping the grand total moving with a transaction, because
 *     `grandTotalData` creates that row but does not update it;
 *   - throttling, so a feed ticking faster than the eye can follow does not
 *     re-read every loaded block per tick.
 *
 * Deliberately free of any AG Grid import: the grid api is described
 * structurally, so this folder still has no dependency on AG Grid and can be
 * unit-tested without one.
 */
import {
  createPerspectiveDatasource,
  type PerspectiveDatasource,
  type ServerSideRequestLike,
} from './perspectiveDatasource.js';
import {
  createViewManager,
  type PerspectiveTableLike,
  type ViewManagerEvent,
} from './viewManager.js';
import { createEditBuffer } from './editBuffer.js';

/** The slice of AG Grid's api the engine drives. */
export interface GridApiLike {
  refreshServerSide(params: { route?: string[]; purge?: boolean }): void;
  forEachNode(callback: (node: GridNodeLike) => void): void;
  getRowNode(id: string): unknown;
  applyServerSideTransaction(transaction: { update?: unknown[] }): void;
  setRowCount?(rows: number): void;
}

export interface GridNodeLike {
  group?: boolean;
  expanded?: boolean;
  level: number;
  key?: string | null;
  parent?: GridNodeLike | null;
}

/** AG's own id for the grand total row (`GRAND_TOTAL_ROW_ID`). */
export const GRAND_TOTAL_ROW_ID = 'rowGroupFooter_ROOT_NODE_ID';

/** Marks the row the engine hands back as the grand total, so a host's
 *  `getRowId` can return `GRAND_TOTAL_ROW_ID` for it. */
export const GRAND_TOTAL_FLAG = '__grandTotal';

export interface PerspectiveRowEngineOpts {
  table: PerspectiveTableLike;
  /** Index column — labels the grand total row where it is always visible. */
  keyColumn: string;
  /** Coalesce Table updates into at most one refresh per this many ms. */
  refreshMs?: number;
  /**
   * Search numeric and date columns too, not just text.
   *
   * MEASURED, 20,000 rows: the compiled expression costs one `match()` per
   * column per token, and that cost is linear — 5 columns 188ms, 11 columns
   * 307ms, 26 columns 993ms, and 26 columns x 2 tokens 2,408ms. Worse, an
   * expression column is recomputed on every Table update for as long as the
   * View lives, so on a ticking book the charge repeats. In the browser, over
   * the proxied session and against the live feed, 26 columns x 2 tokens was
   * effectively unusable.
   *
   * Text columns are what a typed search is nearly always aiming at, and on the
   * demo book they are 11 of 26 — so the default halves the cost and keeps
   * multi-token searches responsive. Set true to accept the cost and match AG's
   * client-side behaviour, which searches every column's formatted value.
   */
  quickFilterAllColumns?: boolean;
  /**
   * Ceiling on an export. Above it `readAllRows` answers null rather than a
   * short file, because an export that stopped early is indistinguishable from
   * a complete one once it is open in Excel.
   */
  maxExportRows?: number;
  /**
   * Ceiling on one master row's detail grid. Truncates rather than refusing,
   * unlike an export: a detail panel is a bounded surface the user is looking
   * at, not a file that will be read later with no way to tell it is short.
   */
  maxDetailRows?: number;
  /**
   * Column ids forming a tree hierarchy, outermost first — AG's server-side
   * **tree** mode rather than its row-group mode. The rows served for a
   * non-leaf level carry `__treeKey` / `__treeGroup`, which is how AG reads a
   * hierarchy off the data when there are no group columns to read it from.
   */
  treeFields?: readonly string[];
  /** Coalesce cell edits made within this window into one Table write. */
  editFlushMs?: number;
  onEvent?(event: ViewManagerEvent): void;
  /** A block that failed. AG never retries one on its own. */
  onError?(error: unknown): void;
}

/**
 * What a status bar can honestly say on the pull path.
 *
 * Every count comes from the worker-held Table, NOT from the rows this window
 * is holding. A stock AG status panel would aggregate the ~100 rows in the
 * loaded blocks and report a plausible, wrong number — which is the failure
 * mode this whole migration keeps running into.
 */
export interface PerspectiveGridStatus {
  /** Rows in the book, ignoring every filter. Null until measured. */
  bookRows: number | null;
  /**
   * Rows the grid's ROOT LEVEL holds — what AG sizes its store from, and under
   * grouping the number of top-level GROUPS rather than of rows.
   *
   * For "how many rows is the user looking at", use {@link leafRows}. Reading
   * this one in a status bar produced "9 of 50,000" over an unfiltered book
   * grouped into nine asset classes.
   */
  filteredRows: number | null;
  /**
   * Rows of the filtered book, ignoring grouping. Null while unmeasurable — a
   * status bar shows nothing rather than a guess.
   */
  leafRows: number | null;
  /** True when a filter is actually narrowing the book. */
  filtered: boolean;
  /** Re-reading on Table updates. */
  live: boolean;
  /** Live Views this window holds — one per open group level. */
  liveViews: number;
  /** Blocks that failed; AG never retries one on its own. */
  failedBlocks: number;
}

/** One committed cell edit, as the grid reports it. */
export interface PerspectiveCellEdit {
  /** The edited row's value for the Table's index column. */
  key: unknown;
  /** Column being written — the Perspective column name. */
  field: string;
  value: unknown;
}

export interface PerspectiveRowEngine {
  datasource: PerspectiveDatasource;
  /** Connect the grid once it exists; pass null to disconnect. */
  setApi(api: GridApiLike | null): void;
  /** Rows in the root level, for `setRowCount`. Null until a View is built. */
  readonly rowsAtRoot: number | null;
  /** Current status — safe to call at any time. */
  readonly status: PerspectiveGridStatus;
  /** Subscribe to status changes. Returns an unsubscribe. */
  subscribe(listener: (status: PerspectiveGridStatus) => void): () => void;
  /** Stop re-reading on Table updates without tearing anything down. */
  setLive(live: boolean): void;
  readonly live: boolean;
  /** Refresh every level now, ignoring the throttle. */
  refreshNow(): void;
  /**
   * The child rows behind an expanded master row — the book's rows whose
   * columns equal every entry of `match`.
   *
   * Not scoped to the grid's filter: a master row must expand onto the same
   * children whatever else is on screen.
   */
  readMatchingRows(
    match: Record<string, unknown>,
    limit?: number,
  ): Promise<Record<string, unknown>[] | null>;
  /**
   * Publish the calculated columns as Perspective expression columns, so their
   * values feed sort, filter, group and aggregate server-side.
   *
   * Expressions are VALIDATED first and the broken ones dropped: a single bad
   * expression makes every `table.view()` throw, which would blank the grid
   * rather than hide one column. Each drop is reported through `onError`.
   */
  setCalcExpressions(expressions: Record<string, string>): Promise<void>;
  /**
   * Apply the quick search across the book.
   *
   * AG's own `quickFilterText` is a client-side-row-model option and does
   * nothing under a server row model, so the text has to be handed here and
   * compiled into the View.
   */
  setQuickFilter(text: string): Promise<void>;
  /**
   * Every row of the current filtered, sorted book, flat — for an export.
   *
   * This is the one operation that legitimately wants the whole book, and the
   * only place on this path that materializes it. Null when the book exceeds
   * the configured ceiling, so a caller reports that rather than writing a file
   * that looks complete and is not.
   */
  readAllRows(): Promise<Record<string, unknown>[] | null>;
  /**
   * Persist a committed cell edit into the worker-held Table.
   *
   * Fire and forget — the grid has already painted the new value and the write
   * comes back through the normal refresh. Coalesced, so a bulk update or a
   * smart-edit patch lands as ONE write rather than one per cell.
   */
  applyEdit(edit: PerspectiveCellEdit): void;
  /** Write any buffered edits now. Resolves once the Table has them. */
  flushEdits(): Promise<void>;
  /** Number of live Views — diagnostics. */
  readonly liveViews: number;
  close(): Promise<void>;
}

export function createPerspectiveRowEngine(
  opts: PerspectiveRowEngineOpts,
): PerspectiveRowEngine {
  const {
    table,
    keyColumn,
    refreshMs = 250,
    quickFilterAllColumns = false,
    maxExportRows = 200_000,
    maxDetailRows = 500,
    treeFields,
    editFlushMs = 0,
    onEvent,
    onError,
  } = opts;

  let api: GridApiLike | null = null;
  let live = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingUpdate = false;
  let closed = false;
  /** The most recent root-level request, so the total matches the grid shape. */
  let lastRootRequest: ServerSideRequestLike = {};
  /**
   * Set once the root level has been grouped, so row count is not published.
   *
   * Tree mode counts as grouped from the start: `setRowCount` raises AG error
   * #28 whenever a row-group column exists, the error is SILENT without
   * ValidationModule, and a tree level is a group level by another name.
   */
  let grouped = (treeFields?.length ?? 0) > 0;

  let bookRows: number | null = null;
  let leafRows: number | null = null;
  let failedBlocks = 0;
  const listeners = new Set<(status: PerspectiveGridStatus) => void>();

  /** Declared column types, fetched once. Null when the Table cannot report
   *  them — the quick filter then spans no columns and an edit is written as
   *  the grid produced it. */
  let schemaPromise: Promise<Record<string, string> | null> | null = null;

  function tableSchema(): Promise<Record<string, string> | null> {
    schemaPromise ??=
      typeof table.schema === 'function'
        ? table.schema().catch(() => null)
        : Promise.resolve(null);
    return schemaPromise;
  }

  const edits = createEditBuffer({
    table,
    keyColumn,
    schema: tableSchema,
    flushMs: editFlushMs,
    onError,
  });

  function currentStatus(): PerspectiveGridStatus {
    const filteredRows = views.rowsAtRoot;
    // "Filtered" is a claim about ROWS, so it is made from the leaf count when
    // one exists. Made from `rowsAtRoot` it was true of every grouped grid —
    // nine asset classes out of 50,000 rows reads as a filter that is not
    // there. Falls back only while the leaf count is unmeasured.
    const rows = leafRows ?? filteredRows;
    return {
      bookRows,
      filteredRows,
      leafRows,
      // Only claim "filtered" once both numbers are known — an unmeasured
      // book must not render as "0 of N".
      filtered: bookRows !== null && rows !== null && rows < bookRows,
      live,
      liveViews: views.liveViews,
      failedBlocks,
    };
  }

  function publishStatus(): void {
    if (listeners.size === 0) return;
    const snapshot = currentStatus();
    for (const listener of listeners) listener(snapshot);
  }

  /** Measure the unfiltered book. Cheap, and the only figure a View cannot
   *  give — a View only ever knows its own filtered row count. */
  function measureBook(): void {
    if (closed || typeof table.size !== 'function') return;
    void table
      .size()
      .then((size) => {
        if (closed) return;
        const changed = size !== bookRows;
        bookRows = size;
        if (changed) publishStatus();
        // A non-empty book under a grid showing nothing is the signature of a
        // store that settled before the rows existed — the normal case for a
        // blotter that opened during the snapshot. Nothing else will nudge it:
        // AG does not re-ask a store it believes is empty.
        if (size > 0 && views.rowsAtRoot === 0) scheduleRefresh();
      })
      .catch(() => {
        /* a status figure must never break the grid */
      });
  }

  /**
   * Rows of the filtered book, ignoring grouping — the figure a status bar
   * means by "rows".
   *
   * Ungrouped, `rowsAtRoot` IS that figure: the grid's root level is the rows,
   * and measuring it separately would build a second View of the same shape for
   * a number already in hand, on every flat grid.
   *
   * A grouped root hides it, and recovering it costs a whole-book View — a
   * question about the book rather than about this window's viewport, which is
   * what the worker-side query engine is for. Until that lands the figure is
   * NULL rather than substituted: `rowsAtRoot` under grouping is the number of
   * top-level GROUPS, and reporting it produced "Rows : 9 of 50,000" over an
   * unfiltered book grouped into nine asset classes.
   */
  function measureLeafRows(): void {
    if (closed) return;
    const rows = grouped ? null : views.rowsAtRoot;
    if (rows === leafRows) return;
    leafRows = rows;
    publishStatus();
  }

  const views = createViewManager({
    table,
    treeFields,
    onUpdate: () => {
      // The book itself can grow or shrink under the feed, so the unfiltered
      // total is re-measured on updates rather than read once at startup.
      measureBook();
      measureLeafRows();
      scheduleRefresh();
    },
    onEvent: (event) => {
      onEvent?.(event);
      if (event.type !== 'view' || event.depth !== 0) return;
      // `setRowCount` raises AG error #28 while grouping, and the error is
      // SILENT without ValidationModule. Grouped levels are small enough to
      // discover by walking off the end.
      if (!grouped && typeof event.rows === 'number') api?.setRowCount?.(event.rows);
      // A new root View means a new filtered count — the figure the status bar
      // exists to show.
      publishStatus();
    },
  });

  /**
   * Refresh the root store AND every expanded group's store.
   *
   * MEASURED: `refreshServerSide` does NOT cascade into child stores. With
   * two levels expanded it refreshed the top rows and their footer and left
   * the rows underneath frozen at their opening values — aggregates that look
   * live at the top and are stale one row down, which is worse than obviously
   * not updating.
   */
  function refreshEveryLevel(): void {
    if (api === null) return;
    // MEASURED on the live feed: a root store that settled at ZERO rows never
    // re-asks on a non-purging refresh — there are no blocks to invalidate, so
    // there is nothing to reload. That is precisely the state a blotter opens
    // in when it attaches before the snapshot lands: the Table then fills to
    // 20,000 rows and the grid stays empty forever, reporting "0 of 20,000".
    // Purge ONLY in that case — purging a populated store would throw away the
    // user's scroll position on every tick.
    api.refreshServerSide({ purge: views.rowsAtRoot === 0 });
    const routes: string[][] = [];
    api.forEachNode((node) => {
      if (!node.group || !node.expanded) return;
      const route: string[] = [];
      for (let n: GridNodeLike | null | undefined = node; n && n.level >= 0; n = n.parent) {
        if (typeof n.key === 'string') route.unshift(n.key);
      }
      routes.push(route);
    });
    for (const route of routes) api.refreshServerSide({ route, purge: false });
  }

  /**
   * Keep the grand total moving.
   *
   * MEASURED: `grandTotalData` on a block response CREATES the row and
   * updates it after a purge, but a `refreshServerSide({purge:false})` does
   * NOT apply it — five distinct fresh totals over five refreshes left the row
   * showing the first. The documented way to update an existing one is a
   * transaction whose row id is `GRAND_TOTAL_ROW_ID`.
   */
  async function pushGrandTotal(): Promise<void> {
    if (api === null || closed) return;
    if (!api.getRowNode(GRAND_TOTAL_ROW_ID)) return;
    // `liveOnly`: keeping an existing total moving is worth reading a View the
    // grid already holds, and nothing more. Building one costs the same as a
    // block on a wide book, and a shape that has no live View is one the grid
    // has moved off — its next block brings the total with it.
    const request = lastRootRequest;
    const total = await grandTotalFor(request, true);
    // The purge that follows a filter change destroys this row (MEASURED:
    // absent 50 ms after the filter, back at ~1 s when the block arrives), so
    // re-check rather than transacting against a row that is gone.
    if (
      total &&
      api !== null &&
      request === lastRootRequest &&
      api.getRowNode(GRAND_TOTAL_ROW_ID)
    ) {
      api.applyServerSideTransaction({ update: [total] });
    }
  }

  async function grandTotalFor(
    request: ServerSideRequestLike,
    liveOnly = false,
  ): Promise<Record<string, unknown> | null> {
    // A superseded root request gets no total.
    //
    // MEASURED on the 50k x 400 stress book: clicking a filter pill left a
    // block from the OUTGOING filter still in flight, and that block's grand
    // total built a whole extra View — `by=[assetClass] f=[] agg=7`, 1,310 ms —
    // for a row the grid was about to replace, in the same serialized engine
    // the block the user is actually waiting for had to queue behind. The
    // datasource passes the very object it handed `getView`, so identity
    // against `lastRootRequest` is an exact test for "a newer root block has
    // since arrived" — no shape comparison needed. `pushGrandTotal` passes
    // `lastRootRequest` itself and is therefore never refused.
    if (request !== lastRootRequest) return null;
    const total = await views.readGrandTotal(request, { liveOnly });
    if (!total) return null;
    // The caption goes on the key column: it is the one AG never hides, while
    // a grouped column disappears and the auto-group column renders nothing
    // for a total row.
    return { ...total, [keyColumn]: 'GRAND TOTAL', [GRAND_TOTAL_FLAG]: true };
  }

  /**
   * How long the live re-read may be held off by blocks still in flight before
   * it goes anyway. A grid busy enough never to be idle would otherwise stop
   * moving its grand total, which is the one figure a block response cannot
   * update on its own.
   */
  const REFRESH_DEFER_MAX_MS = 2000;
  let deferringSince = Date.now();
  let blocksInFlight = 0;

  function scheduleRefresh(): void {
    if (!live || closed) return;
    pendingUpdate = true;
    // MEASURED: AG requests its FIRST block before `onGridReady` fires, so the
    // grid is not connected yet when that block settles empty and asks for a
    // heal. Dropping the intent here left the store permanently at zero rows
    // over a full book. Remember it; `setApi` flushes it on connect.
    if (api === null) return;
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      if (!pendingUpdate || !live || closed) return;
      /**
       * Never re-read a block that is still being read.
       *
       * MEASURED on the 50k x 400 stress book: one 100-row block costs
       * **900–1,670 ms**, because a read carries every column of the View and
       * there are 400 of them. The refresh invalidates EVERY loaded block, so
       * at the 250 ms throttle the engine was asked to re-read three blocks
       * four times a second while each one took a second — the same ranges
       * were re-requested five and six times over, and the queue never
       * drained. A scroll then had to wait behind ~1 s of work it did not ask
       * for. Deferring here is not a lost update: `pendingUpdate` stays set and
       * the blocks that settle carry the fresh values anyway, since each one is
       * read from the live View at the moment it is served.
       */
      if (blocksInFlight > 0 && Date.now() - deferringSince < REFRESH_DEFER_MAX_MS) {
        scheduleRefresh();
        return;
      }
      deferringSince = Date.now();
      pendingUpdate = false;
      refreshEveryLevel();
      void pushGrandTotal();
    }, refreshMs);
  }

  const rawDatasource = createPerspectiveDatasource({
    getView: async (request) => {
      grouped =
        (request.rowGroupCols?.length ?? 0) > 0 || (treeFields?.length ?? 0) > 0;
      if (!request.groupKeys?.length) lastRootRequest = request;
      const view = await views.getView(request);
      // A root level that reads as empty is either a genuinely empty book or a
      // store that raced the snapshot. `measureBook` tells the two apart and
      // schedules the refresh when it was the race — the loop terminates
      // because the answer stops being zero as soon as rows exist.
      if (!grouped && views.rowsAtRoot === 0) measureBook();
      measureLeafRows();
      // The `view` event fires only when a View is BUILT. A cached View that
      // was re-measured — the normal case once the book has settled — changes
      // the filtered count without one, and the status bar was left showing
      // "0 of 20,000" over a grid that had just filled.
      publishStatus();
      return view;
    },
    getGeneration: () => views.getGeneration(),
    getGrandTotal: grandTotalFor,
    onError: (error) => {
      failedBlocks += 1;
      publishStatus();
      onError?.(error);
    },
  });

  /**
   * Count blocks in flight, so the live re-read can yield to them.
   *
   * Wrapping rather than reporting from inside the datasource keeps RULE 1
   * where it belongs: the wrapper settles exactly when the inner one does,
   * because it only decorates the two callbacks that can end a block.
   */
  const datasource: PerspectiveDatasource = {
    getRows(params) {
      blocksInFlight += 1;
      let settled = false;
      const once = () => {
        if (settled) return;
        settled = true;
        blocksInFlight = Math.max(0, blocksInFlight - 1);
      };
      const { success, fail } = params;
      rawDatasource.getRows({
        ...params,
        success: (result) => {
          once();
          success(result);
        },
        fail: () => {
          once();
          fail();
        },
      });
    },
  };

  return {
    datasource,

    setApi(next: GridApiLike | null) {
      api = next;
      if (api === null) return;
      if (!grouped && views.rowsAtRoot !== null) {
        api.setRowCount?.(views.rowsAtRoot);
      }
      measureBook();
      // Anything that asked for a refresh while the grid was unconnected.
      if (pendingUpdate) scheduleRefresh();
    },

    get rowsAtRoot() {
      return views.rowsAtRoot;
    },

    get status() {
      return currentStatus();
    },

    subscribe(listener: (status: PerspectiveGridStatus) => void) {
      listeners.add(listener);
      measureLeafRows();
      // Measure on first interest rather than at construction: a grid with no
      // status bar should not pay for a figure nothing reads.
      measureBook();
      listener(currentStatus());
      return () => listeners.delete(listener);
    },

    get liveViews() {
      return views.liveViews;
    },

    get live() {
      return live;
    },

    setLive(next: boolean) {
      live = next;
      if (live) scheduleRefresh();
      publishStatus();
    },

    refreshNow() {
      if (closed) return;
      refreshEveryLevel();
      void pushGrandTotal();
    },

    applyEdit(edit) {
      if (closed) return;
      edits.add(edit.key, edit.field, edit.value);
    },

    flushEdits() {
      return edits.flush();
    },

    readMatchingRows(match, limit = maxDetailRows) {
      if (closed) return Promise.resolve(null);
      // Deliberately uncached: a detail grid is opened by a click, not by a
      // per-tick paint, so there is no burst to absorb — and a cached answer
      // would be the wrong trade, since the rows are shown next to a master
      // row the user just expanded and expects to be current.
      return views.readMatchingRows(match, limit).catch(() => null);
    },

    readAllRows() {
      if (closed) return Promise.resolve(null);
      // The last ROOT request carries the sort and filter the user is looking
      // at; grouping is dropped inside, since an export wants leaf rows.
      return views.readAllRows(lastRootRequest, maxExportRows).catch(() => null);
    },

    async setCalcExpressions(next) {
      if (closed) return;

      let usable = next ?? {};
      // MEASURED: one bad expression takes the whole View down, not just its
      // own column — so a typo in a calculated column would blank the grid.
      // Check first and keep only what compiles.
      if (Object.keys(usable).length > 0 && typeof table.validate_expressions === 'function') {
        try {
          const report = await table.validate_expressions(usable);
          if (closed) return;
          const errors = report?.errors ?? {};
          if (Object.keys(errors).length > 0) {
            const kept: Record<string, string> = {};
            for (const [colId, source] of Object.entries(usable)) {
              if (!errors[colId]) kept[colId] = source;
              else {
                onError?.(
                  new Error(
                    `perspective: calculated column "${colId}" did not compile — ${
                      errors[colId]?.error_message ?? 'unknown error'
                    }`,
                  ),
                );
              }
            }
            usable = kept;
          }
        } catch (error) {
          // The check itself failing must not cost the user every calc column.
          onError?.(error);
        }
      }

      if (!views.setExpressions(usable)) return;
      // Same reasoning as the quick filter: AG cannot know these changed.
      api?.refreshServerSide({ purge: true });
      void pushGrandTotal();
    },

    async setQuickFilter(text) {
      if (closed) return;

      // Text columns only by default — the cost is one `match()` per column
      // per token, recharged on every Table update while the View lives, and
      // searching all 26 columns of the demo book was unusable at two tokens.
      // `string()` in the compiled expression means opting in to the rest still
      // works; see `quickFilterAllColumns`.
      const schema = await tableSchema();
      if (closed) return;
      const columns = schema
        ? Object.keys(schema).filter(
            (col) => quickFilterAllColumns || schema[col] === 'string',
          )
        : [];
      if (!views.setQuickFilter(text ?? '', columns)) return;
      measureLeafRows();

      // AG does not know this filter exists, so nothing invalidates its store:
      // it would keep serving the pre-search blocks and its row count. A quick
      // search changes the row count drastically, so this is the one case that
      // always purges — `refreshEveryLevel` only purges an empty store.
      api?.refreshServerSide({ purge: true });
      void pushGrandTotal();
    },

    async close() {
      // Edits first, and BEFORE `closed` is set: an engine is closed whenever
      // the Table is swapped or the grid unmounts, and a cell committed in the
      // last frame before that would otherwise be dropped without a trace.
      await edits.close();

      closed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      api = null;
      listeners.clear();
      await views.close();
    },
  };
}
