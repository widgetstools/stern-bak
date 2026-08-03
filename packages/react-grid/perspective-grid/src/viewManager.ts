/**
 * Per-window View lifecycle for the AG Grid datasource.
 *
 * A flat blotter needs one View. A grouped one needs several at once: AG Grid
 * pulls a group tree one level at a time, so an expanded path keeps its own
 * level alive alongside the root and its siblings. This keeps a keyed map of
 * live Views rather than a single current one — swapping on every request
 * would thrash a grouped grid into rebuilding a View per block.
 *
 * Live Views are not free (each costs the engine work on every table update),
 * so the map is capped and the least recently used are retired. Every disposal
 * goes through `createSafeView`, which drains in-flight reads before deleting —
 * the operation the engine can be killed by (see `safeView.ts`).
 *
 * MEASURED, and the reason `generation` moves only in `invalidate()`: the
 * datasource captures the generation at `getRows` entry and re-checks it after
 * `getView` resolves. If building the View that a request asked for bumped it,
 * that request would fence ITSELF off and settle empty — the grid renders
 * blank on first load and after every sort and filter change, while the log
 * cheerfully reports the View was rebuilt with the right row count. So the
 * generation means "something OTHER than a block request invalidated the
 * Views": a schema change, new calculated columns, a different Table.
 *
 * Whole-book QUESTIONS — how many rows match a saved filter, what are a
 * column's distinct values, does any row satisfy a style rule — are
 * deliberately absent. Answering them per window means one full-book View per
 * window per question, in the same serialized engine the block reads queue
 * behind; they belong to the worker-side query engine, which can dedupe an
 * identical question across every blotter on the desk. What is left here is
 * the block path plus the two one-shot pulls that genuinely belong to one
 * window: `readAllRows` (this window's export) and `readMatchingRows` (the
 * children of a master row this window expanded).
 */
import { createSafeView, type DeletableView, type SafeView } from './safeView.js';
import {
  columnsToRows,
  type PerspectiveViewLike,
  type ServerSideRequestLike,
} from './perspectiveDatasource.js';
import {
  toPerspectiveGroupLevel,
  type AgFilterItem,
  type PerspectiveViewConfig,
} from '@wellsfargo-starui/core';
import {
  blankUnaggregatedNonNumeric,
  toGroupColumns,
  toTreeColumns,
  viewConfigKey,
} from './viewConfig.js';

/** A View that can also report table updates. `on_update` is optional so a
 *  minimal View still satisfies the contract. */
export interface UpdatableView extends DeletableView {
  on_update?(callback: () => void): Promise<unknown>;
}

/** The slice of a Perspective `Table` this needs. */
export interface PerspectiveTableLike {
  view(config: PerspectiveViewConfig): Promise<UpdatableView>;
  /** Rows in the whole book, ignoring any View's filters. */
  size?(): Promise<number>;
  /**
   * Upsert by the Table's index column. Sparse rows leave every omitted
   * column alone — which is what makes a single edited cell a legal write.
   * Optional so a read-only Table (and every test fake) still satisfies this.
   */
  update?(rows: Record<string, unknown>[]): Promise<void>;
  /** Declared column types. Used to coerce an edited value before writing it. */
  schema?(): Promise<Record<string, string>>;
  /**
   * Pre-flight expression check. Returns the columns that compiled under
   * `expression_schema` and the ones that did not under `errors`.
   *
   * MEASURED: a single bad expression makes `table.view()` throw and takes the
   * WHOLE View down — so one broken calculated column would blank the entire
   * grid. Optional, because a Table that cannot check is still usable.
   */
  validate_expressions?(expressions: Record<string, string>): Promise<{
    expression_schema?: Record<string, string>;
    errors?: Record<string, { error_message?: string }>;
  }>;
}

export interface ViewManagerEvent {
  type: 'view' | 'retire';
  key: string;
  /** Present on `view`. */
  config?: PerspectiveViewConfig;
  depth?: number;
  groupColId?: string | null;
  /** Rows AG can ask for — excludes the level total row on a grouped View. */
  rows?: number;
  ms?: number;
  /** Present on `retire`. */
  why?: 'lru' | 'shape' | 'close';
}

export interface ViewManagerOpts {
  table: PerspectiveTableLike;
  onEvent?(event: ViewManagerEvent): void;
  /** Called when the Table behind a live View changes. */
  onUpdate?(): void;
  /** Cap on simultaneously live Views. */
  maxViews?: number;
  /**
   * Column ids forming a tree hierarchy, outermost first. Present means the
   * grid runs in AG's server-side **tree** mode rather than its row-group mode.
   *
   * The two are the same pull shape — AG asks for the children of a path and
   * the level maps onto `group_by: [one column]` plus ancestor clauses — so
   * this reuses `toPerspectiveGroupLevel` by standing in for `rowGroupCols`,
   * which AG does not send in tree mode. What differs is the OUTPUT: tree rows
   * have to carry `__treeKey` and `__treeGroup`, because AG reads the hierarchy
   * off the data instead of off group columns.
   */
  treeFields?: readonly string[];
}

export interface ViewManager {
  getGeneration(): number;
  /** Invalidate every View for a reason the grid did not cause, so blocks
   *  already in flight resolve empty instead of painting rows the grid can no
   *  longer interpret. */
  invalidate(): void;
  /** Rows in the root level — for `setRowCount`. Null until one is built. */
  readonly rowsAtRoot: number | null;
  readonly liveViews: number;
  getView(request: ServerSideRequestLike): Promise<PerspectiveViewLike | null>;
  /**
   * The grand total row, or null when unavailable.
   *
   * `liveOnly` refuses to BUILD a View for it and answers null when the one it
   * would read is not already live. The throttled refresh uses that: MEASURED
   * on the 50k x 400 stress book, a push scheduled a few milliseconds before a
   * filter change found its View retired by the shape swap and built a fresh
   * one — 1,310 ms of engine work, in front of the block the user was waiting
   * for, for a total row the purge had already destroyed. A block request
   * passes `liveOnly: false`, because there the total is the point.
   */
  readGrandTotal(
    request: ServerSideRequestLike,
    opts?: { liveOnly?: boolean },
  ): Promise<Record<string, unknown> | null>;
  /**
   * The book's rows whose columns equal every entry of `match` — the child
   * rows behind an expanded master row.
   *
   * Deliberately NOT scoped to the grid's filter or sort: a detail grid shows
   * what belongs to its master, and hiding a child because the master list is
   * filtered would make the same master expand differently depending on what
   * else is on screen.
   */
  readMatchingRows(
    match: Record<string, unknown>,
    limit: number,
  ): Promise<Record<string, unknown>[] | null>;
  /**
   * Set the quick search. Returns true when it actually changed, so a caller
   * only pays for a purge when there is something to purge for.
   *
   * Held here rather than taken off the AG request because AG does not carry
   * it — `quickFilterText` is a client-side-row-model option and the server
   * row model never sees it.
   */
  setQuickFilter(text: string, columns: readonly string[]): boolean;
  /**
   * Calculated columns, as Perspective expression source keyed by column id.
   *
   * Held here for the same reason the quick filter is: AG's request does not
   * carry them, and they change what a View contains. Returns true when the map
   * actually changed.
   */
  setExpressions(expressions: Record<string, string>): boolean;
  /**
   * Every row of the current filtered, sorted book — for an export, which is
   * the one operation that legitimately wants the whole thing.
   *
   * Null when the book is larger than `limit`: an export that silently stopped
   * short would be taken for a complete one.
   */
  readAllRows(
    request: ServerSideRequestLike,
    limit: number,
  ): Promise<Record<string, unknown>[] | null>;
  close(): Promise<void>;
}

/** Constant expression column that gives a FLAT view a grand-total row. */
const TOTAL_GROUP = '__all__';

/** Rows per read when draining the whole book for an export. One read of
 *  20,000 x 26 would cross the proxy as a single message. */
const EXPORT_CHUNK_ROWS = 10_000;

interface Entry {
  key: string;
  config: PerspectiveViewConfig;
  safe: SafeView;
  groupColId: string | null;
  depth: number;
  /** Rows AG can ask for — the level total row is not one of them. */
  rows: number;
  usedAt: number;
}

/** Quick-search text plus the columns it spans. */
interface QuickFilter {
  text: string;
  columns: readonly string[];
}

/** The parts of a request that decide which Views are still relevant. */
function shapeOf(
  request: ServerSideRequestLike,
  quick: QuickFilter,
  expressionsForShape: Record<string, string>,
): string {
  return JSON.stringify({
    sort: request.sortModel ?? null,
    filter: request.filterModel ?? null,
    groups: request.rowGroupCols?.map((c) => c.id) ?? null,
    values: request.valueCols?.map((c) => [c.id, c.aggFunc]) ?? null,
    // The quick filter is NOT part of the AG request — it is held here — but it
    // changes which rows a View contains, so it has to change the shape or
    // every live View would survive a search with the wrong rows in it.
    quick: quick.text || null,
    // A changed calc column makes every live View stale in the same way.
    exprs: Object.keys(expressionsForShape).sort().map((k) => [k, expressionsForShape[k]]),
  });
}

function levelState(
  request: ServerSideRequestLike,
  quick: QuickFilter,
  exprs: Record<string, string>,
) {
  return {
    sortModel: request.sortModel,
    filterModel: request.filterModel as Record<string, AgFilterItem> | null | undefined,
    rowGroupCols: request.rowGroupCols,
    valueCols: request.valueCols,
    groupKeys: request.groupKeys,
    quickFilterText: quick.text,
    quickFilterColumns: quick.columns,
    expressions: exprs,
  };
}

export function createViewManager(opts: ViewManagerOpts): ViewManager {
  const { table, onEvent = () => {}, onUpdate, maxViews = 24, treeFields } = opts;

  /**
   * Column -> Perspective type, read once.
   *
   * Only used to decide which columns are numeric when blanking aggregate
   * cells. A failure answers null, and `blankUnaggregatedNonNumeric` then
   * leaves every column alone — degrading to the old behaviour rather than
   * blanking something that was carrying a real total.
   */
  let schemaPromise: Promise<Record<string, string> | null> | null = null;
  function tableSchema(): Promise<Record<string, string> | null> {
    schemaPromise ??=
      typeof table.schema === 'function'
        ? table.schema().catch(() => null)
        : Promise.resolve(null);
    return schemaPromise;
  }

  const tree = treeFields ?? [];
  /**
   * Stand the tree fields in for `rowGroupCols`, which AG does not send in tree
   * mode. A request that DOES carry group columns is left alone: the user has
   * dragged a column into the group panel, and that intent wins over the
   * configured hierarchy rather than silently merging with it.
   */
  const withTreeLevels = (request: ServerSideRequestLike): ServerSideRequestLike =>
    tree.length > 0 && !request.rowGroupCols?.length
      ? { ...request, rowGroupCols: tree.map((id) => ({ id })) }
      : request;

  const entries = new Map<string, Entry>();
  /** Creation in flight, so two blocks cannot build the same View twice. */
  const building = new Map<string, Promise<Entry>>();
  /**
   * Views built to answer a question rather than to serve a block — they are
   * read once and dropped. Tracked only so `close()` can drain them: a
   * transient View outliving the manager is a live View charged on every tick
   * that nothing will ever retire.
   */
  const transient = new Set<SafeView>();
  let shape: string | null = null;
  let generation = 0;
  let rowsAtRoot: number | null = null;
  let closed = false;
  /** Quick search. Held here rather than read off the request, because AG does
   *  not carry it: `quickFilterText` is a client-side-row-model option. */
  let quick: QuickFilter = { text: '', columns: [] };
  /** Calculated columns. Every View built here carries them, so a calc column
   *  is sortable, filterable and groupable like any real one. */
  let expressions: Record<string, string> = {};

  function retire(entry: Entry, why: 'lru' | 'shape' | 'close'): void {
    entries.delete(entry.key);
    void entry.safe.close();
    onEvent({ type: 'retire', key: entry.key, why });
  }

  function evict(): void {
    if (entries.size <= maxViews) return;
    const byAge = [...entries.values()].sort((a, b) => a.usedAt - b.usedAt);
    for (const entry of byAge.slice(0, entries.size - maxViews)) retire(entry, 'lru');
  }

  async function build(
    key: string,
    config: PerspectiveViewConfig,
    groupColId: string | null,
    depth: number,
  ): Promise<Entry> {
    const started = Date.now();
    const view = await table.view(config);
    const safe = createSafeView(view);
    const total = await view.num_rows();

    const entry: Entry = {
      key,
      config,
      safe,
      groupColId,
      depth,
      // Row 0 of a grouped View is that level's own total, which is not one of
      // the children AG asked for.
      rows: groupColId === null ? total : Math.max(0, total - 1),
      usedAt: Date.now(),
    };

    if (onUpdate && typeof view.on_update === 'function') {
      // The subscription belongs to this View and dies with it, so it is
      // re-made per View. A tick for an already-retired View is ignored.
      await view.on_update(() => {
        if (entries.get(key) === entry) onUpdate();
      });
    }

    entries.set(key, entry);
    evict();
    onEvent({
      type: 'view',
      key,
      config,
      depth,
      groupColId,
      rows: entry.rows,
      ms: Date.now() - started,
    });
    return entry;
  }

  /**
   * Re-read a live View's row count.
   *
   * MEASURED on the live feed: `rows` used to be captured once at build time
   * and never revisited, so a blotter that attached during the snapshot — the
   * normal case, since a window opens long before ~20,000 rows arrive — held a
   * View that reported 0 forever. The book filled underneath it, the status
   * bar read "0 of 20,000", and no amount of refreshing helped: every refresh
   * re-used the same cached count. The count is what AG sizes its store from,
   * so it has to be as live as the rows are.
   */
  async function remeasure(entry: Entry): Promise<Entry> {
    const total = await entry.safe.rows();
    if (total !== null) {
      entry.rows = entry.groupColId === null ? total : Math.max(0, total - 1);
    }
    return entry;
  }

  function ensure(
    key: string,
    config: PerspectiveViewConfig,
    groupColId: string | null,
    depth: number,
  ): Promise<Entry> {
    const existing = entries.get(key);
    if (existing) {
      existing.usedAt = Date.now();
      return remeasure(existing);
    }
    const inFlight = building.get(key);
    if (inFlight) return inFlight;

    const promise = build(key, config, groupColId, depth).finally(() => building.delete(key));
    building.set(key, promise);
    return promise;
  }

  /** Read a window, re-opening the View if it was retired underneath. */
  async function readFrom(
    entry: Entry,
    window: { start_row: number; end_row: number },
  ): Promise<Record<string, unknown[]>> {
    const columns = await entry.safe.read(window);
    if (columns !== null) return columns;

    // Retired between `getView` and the read. Settling short here would look
    // like the end of the book and cap the store permanently ("empty
    // resolutions omit rowCount"), so re-open instead.
    const rebuilt = await ensure(entry.key, entry.config, entry.groupColId, entry.depth);
    const retry = await rebuilt.safe.read(window);
    if (retry === null) throw new Error(`view ${entry.key} closed twice under one block`);
    return retry;
  }

  /** Build, read once, drop — for a question the grid did not ask as a block. */
  async function withTransientView<T>(
    config: PerspectiveViewConfig,
    read: (safe: SafeView) => Promise<T | null>,
  ): Promise<T | null> {
    if (closed) return null;

    let safe: SafeView;
    try {
      safe = createSafeView(await table.view(config));
    } catch {
      // A config that will not build takes only its own answer down — the View
      // is transient, so the grid never sees it.
      return null;
    }
    if (closed) {
      void safe.close();
      return null;
    }
    transient.add(safe);
    try {
      return await read(safe);
    } finally {
      transient.delete(safe);
      void safe.close();
    }
  }

  return {
    getGeneration: () => generation,

    invalidate() {
      generation += 1;
    },

    get rowsAtRoot() {
      return rowsAtRoot;
    },

    get liveViews() {
      return entries.size;
    },

    async getView(request: ServerSideRequestLike): Promise<PerspectiveViewLike | null> {
      if (closed) return null;

      const levelled = withTreeLevels(request);

      // A new sort/filter/grouping makes every existing View garbage. Retire
      // them now rather than waiting for the LRU: they would otherwise keep
      // charging the engine on every tick for a shape nothing will ask for.
      const nextShape = shapeOf(levelled, quick, expressions);
      if (shape !== null && shape !== nextShape) {
        for (const entry of [...entries.values()]) retire(entry, 'shape');
      }
      shape = nextShape;

      const level = toPerspectiveGroupLevel(levelState(levelled, quick, expressions));
      const key = viewConfigKey(level.config);
      const entry = await ensure(key, level.config, level.groupColId, level.depth);
      if (closed) return null;

      // Only a View built for a BLOCK request counts as the root. The
      // grand-total View is depth 0 too, and it holds exactly one group, so
      // recording its count here published a row count of 1 to the grid and
      // capped the store at a single row.
      if (level.depth === 0) rowsAtRoot = entry.rows;

      const { groupColId } = entry;
      return {
        to_columns: async (window) => {
          // Group levels are offset by one: row 0 is this level's own total,
          // and AG asked for children.
          const offset = groupColId === null ? 0 : 1;
          const columns = await readFrom(entry, {
            start_row: (window?.start_row ?? 0) + offset,
            end_row: (window?.end_row ?? 0) + offset,
          });
          if (groupColId === null) return columns;
          // A non-numeric column the user did not ask to aggregate is BLANK in
          // a group row, as it is on AG's own row model. Without this,
          // Perspective's per-type default fills text columns with a
          // distinct-count and a group header reads like data.
          const blanked = blankUnaggregatedNonNumeric(columns, {
            schema: await tableSchema(),
            aggregates: entry.config?.aggregates,
            keep: [groupColId],
          });
          // In tree mode the rows also carry the markers AG reads the
          // hierarchy from; a leaf level is ungrouped and never reaches here,
          // which is why every row this produces is a parent.
          return tree.length > 0
            ? toTreeColumns(blanked, groupColId)
            : toGroupColumns(blanked, groupColId);
        },
        num_rows: () => Promise.resolve(entry.rows),
      };
    },

    /**
     * The grand total, live.
     *
     * When grouping is on this is free — it is row 0 of the root level View,
     * the one AG is already pulling, so it resolves to the same key. When
     * grouping is off there is no total row at all, because an ungrouped View
     * is just rows; one constant expression column produces exactly one group,
     * whose row 0 is the total over the whole filtered book.
     */
    async readGrandTotal(
      request: ServerSideRequestLike,
      opts?: { liveOnly?: boolean },
    ): Promise<Record<string, unknown> | null> {
      if (closed) return null;

      const level = toPerspectiveGroupLevel({
        ...levelState(request, quick, expressions),
        groupKeys: [],
      });
      let config = level.config;
      let groupColId = level.groupColId;
      if (groupColId === null) {
        config = {
          ...config,
          expressions: { ...(config.expressions ?? {}), [TOTAL_GROUP]: "'ALL'" },
          group_by: [TOTAL_GROUP],
        };
        groupColId = TOTAL_GROUP;
      }

      const key = viewConfigKey(config);
      if (opts?.liveOnly && !entries.has(key)) return null;
      const entry = await ensure(key, config, groupColId, 0);
      const raw = await readFrom(entry, { start_row: 0, end_row: 1 });
      // Same rule as a group row: a text column with no aggFunc is blank, not
      // a distinct-count.
      const columns = blankUnaggregatedNonNumeric(raw, {
        schema: await tableSchema(),
        aggregates: config.aggregates,
        keep: [groupColId],
      });

      const total: Record<string, unknown> = {};
      for (const name of Object.keys(columns)) {
        if (name === '__ROW_PATH__') continue;
        total[name] = columns[name]?.[0];
      }
      return total;
    },

    /**
     * The whole current book, flat.
     *
     * Grouping is deliberately dropped: an export wants the leaf rows in the
     * order the grid is showing them, not an interleaved group tree. Read in
     * chunks rather than one call — a single `to_columns` over 20,000 x 26 has
     * to cross the proxy as one message, and chunking keeps each transfer and
     * each buffer copy bounded.
     */
    readAllRows(
      request: ServerSideRequestLike,
      limit: number,
    ): Promise<Record<string, unknown>[] | null> {
      const level = toPerspectiveGroupLevel({
        ...levelState(request, quick, expressions),
        rowGroupCols: undefined,
        groupKeys: [],
      });

      return withTransientView(level.config, async (safe) => {
        const total = await safe.rows();
        if (total === null || total > limit) return null;

        const rows: Record<string, unknown>[] = [];
        for (let start = 0; start < total; start += EXPORT_CHUNK_ROWS) {
          const columns = await safe.read({
            start_row: start,
            end_row: Math.min(start + EXPORT_CHUNK_ROWS, total),
          });
          if (columns === null) return null;
          rows.push(...columnsToRows(columns));
        }
        return rows;
      });
    },

    /**
     * The child rows behind an expanded master row.
     *
     * Transient like every other question-shaped read: built, drained, dropped.
     * The clause shape is the one `toPerspectiveGroupLevel` already uses for
     * ancestor keys, including the null case — `== null` matches nothing in
     * Perspective, so a null match value has to become `is null` or a master
     * row keyed on a missing value would open onto an empty detail grid.
     */
    readMatchingRows(
      match: Record<string, unknown>,
      limit: number,
    ): Promise<Record<string, unknown>[] | null> {
      if (closed) return Promise.resolve(null);
      const clauses = Object.entries(match ?? {});
      // No clauses would select the WHOLE book as one row's children, which is
      // never what a master row means.
      if (clauses.length === 0) return Promise.resolve([]);

      const config: PerspectiveViewConfig = {
        filter: clauses.map(([colId, value]) =>
          value === null || value === undefined ? [colId, 'is null'] : [colId, '==', value],
        ),
        ...(Object.keys(expressions).length > 0 ? { expressions } : {}),
      };

      return withTransientView(config, async (safe) => {
        const total = await safe.rows();
        if (total === null) return null;
        // A detail grid is a fixed-height panel, so this truncates rather than
        // refusing — unlike an export, where a short file is indistinguishable
        // from a complete one. The caller states the limit it chose.
        const wanted = Math.min(total, limit);
        if (wanted === 0) return [];
        const columns = await safe.read({ start_row: 0, end_row: wanted });
        return columns === null ? null : columnsToRows(columns);
      });
    },

    setExpressions(next: Record<string, string>): boolean {
      const keys = Object.keys(next).sort();
      const same =
        keys.length === Object.keys(expressions).length &&
        keys.every((k) => expressions[k] === next[k]);
      if (same) return false;
      expressions = { ...next };
      // Like the quick filter: `getView` retires on shape change, and the shape
      // now includes these — so the next block request drops the stale Views
      // rather than deleting Views with reads still in flight.
      return true;
    },

    setQuickFilter(text: string, columns: readonly string[]): boolean {
      const next = (text ?? '').trim();
      if (next === quick.text) return false;
      quick = { text: next, columns };
      // Do NOT retire here. `getView` retires on shape change, and the shape
      // now includes the quick text — so the next block request drops the stale
      // Views itself. Retiring now would delete Views with reads still in
      // flight from the request that is about to be superseded.
      return true;
    },

    async close(): Promise<void> {
      closed = true;
      const live = [...entries.values()];
      entries.clear();
      for (const entry of live) onEvent({ type: 'retire', key: entry.key, why: 'close' });
      const pending = [...transient];
      transient.clear();
      await Promise.all([
        ...live.map((entry) => entry.safe.close()),
        ...pending.map((safe) => safe.close()),
      ]);
    },
  };
}
