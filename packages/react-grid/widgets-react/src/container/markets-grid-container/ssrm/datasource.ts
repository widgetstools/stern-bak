import type {
  GridApi,
  IRowNode,
  IServerSideDatasource,
  IServerSideGetRowsParams,
  IServerSideGetRowsRequest,
} from 'ag-grid-community';
import type { Table, ViewConfigUpdate } from '@perspective-dev/client';
import { INDEX_COLUMN, type PerspectiveSchema } from './schema.js';
import { ViewCache } from './viewCache.js';
import { decodeMaxAliases, decodeMaxFields } from './query/aggregates.js';
import { buildQuery, type PerspectiveQuery } from './query/viewConfig.js';
import { resolveGroupRoute, type RouteNode } from './groupRoute.js';
import {
  TOTAL_ROW_ID,
  groupKeyToken,
  mapGroupRows,
  mapLeafRows,
  mapTotalRow,
  routeKey,
  type Columnar,
} from './rows.js';
import type { FeedTableEvent, SsrmFeedTable } from './feedTable.js';

export { ROW_ID_FIELD } from './rows.js';

export type SsrmLiveUpdateMode =
  /** Rewrite the cells of rows already on screen; cheapest, and flashes changes. */
  | 'patch'
  /** Ask AG Grid to reload every open block. Correct but far more work. */
  | 'refresh'
  | 'off';

export type PerspectiveSsrmDatasourceOptions = {
  /** The replica table this datasource serves from. */
  table: Promise<Table>;
  /** The feed keeping that table current; drives the live-update path. */
  feed: Pick<SsrmFeedTable, 'subscribe' | 'getRow'>;
  schema: PerspectiveSchema;
  /** Every column a leaf row may need to render. */
  leafColumns: string[];
  liveUpdates?: SsrmLiveUpdateMode;
  /** How long to wait after a table write before touching the grid. */
  liveUpdateDebounceMs?: number;
};

/**
 * Row id AG Grid gives the grand total row, so it can be found and rewritten
 * without a reload.
 */
const GRAND_TOTAL_ROW_ID = 'rowGroupFooter_ROOT_NODE_ID';

/**
 * Group rows read per level when refreshing aggregates. A level with more
 * groups than this has its later groups refreshed when they are next loaded
 * rather than on every tick.
 */
const GROUP_SCAN_LIMIT = 1000;

/**
 * How long the viewport must be still before a live-update flush touches the
 * grid. Patching rendered rows mid-fling fights the scroll's own rendering
 * for the frame budget — under a sweeping feed every row entering the
 * viewport counts as "ticked", so an ungated flush rewrites the whole
 * viewport every debounce while the user is trying to scroll through it.
 * Everything stays pending; one flush catches the backlog up at rest.
 */
const SCROLL_QUIESCENCE_MS = 200;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The group keys leading to a node, in the type the engine grouped by — the
 * same route its own request carried. Built with the same walk the request path
 * uses, so a null-keyed ancestor does not truncate it.
 */
function routeOf(node: IRowNode, groupColumns: readonly string[]): unknown[] {
  return resolveGroupRoute({
    parentNode: node.parent as unknown as RouteNode | null,
    groupColumns,
    requestKeys: [],
  });
}

/**
 * Serves AG Grid's Server-Side Row Model from a Perspective table running in a
 * WebAssembly worker of this window — the same request/response contract a
 * remote server would implement, with the round trip replaced by a
 * `postMessage`.
 *
 * Every request becomes one Perspective view. Grouped requests use
 * `group_rollup_mode: "flat"`, which returns exactly the children of the
 * requested group with no level total in front of them, so `num_rows()` is the
 * child count AG Grid needs and a row window maps directly onto a block.
 */
export class PerspectiveSsrmDatasource implements IServerSideDatasource {
  private readonly options: Required<Omit<PerspectiveSsrmDatasourceOptions, 'table' | 'feed'>> & {
    feed: Pick<SsrmFeedTable, 'subscribe' | 'getRow'>;
  };
  private readonly views: ViewCache;
  private readonly unsubscribe: () => void;
  private api: GridApi | null = null;
  /** The most recent request, reused to re-query rows when the table changes. */
  private lastRequest: IServerSideGetRowsRequest | null = null;
  private rootConfig: ViewConfigUpdate | null = null;
  private rootCount: number | null = null;
  /** Block requests the grid is waiting on right now. */
  private inFlight = 0;
  /** Ids that ticked since the last flush; values come lazily from the feed. */
  private pendingIds = new Set<string>();
  /** Leaf rows on screen at the last flush, so newly visible ones get caught. */
  private lastRenderedIds = new Set<string>();
  private flushHandle: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private destroyed = false;
  /**
   * When the grid body last scrolled; live flushes wait for quiescence.
   * Starts at -Infinity so a grid that has never scrolled never defers —
   * clocks (real or faked) may start near zero.
   */
  private lastScrollAt = Number.NEGATIVE_INFINITY;
  private scrollApi: GridApi | null = null;
  private readonly onBodyScroll = (): void => {
    this.lastScrollAt = now();
  };
  /** Filter conditions the last request could not translate exactly. */
  lastUnsupportedFilters: string[] = [];

  constructor(options: PerspectiveSsrmDatasourceOptions) {
    this.options = {
      schema: options.schema,
      leafColumns: options.leafColumns,
      liveUpdates: options.liveUpdates ?? 'patch',
      liveUpdateDebounceMs: options.liveUpdateDebounceMs ?? 150,
      feed: options.feed,
    };
    this.views = new ViewCache(options.table);
    this.unsubscribe = options.feed.subscribe((event) => this.onTableEvent(event));
  }

  getRows(params: IServerSideGetRowsParams): void {
    if (this.api !== params.api) {
      this.api = params.api;
      this.watchScroll(params.api);
    }
    void this.load(params);
  }

  private watchScroll(api: GridApi): void {
    this.scrollApi?.removeEventListener('bodyScroll', this.onBodyScroll);
    this.scrollApi = api;
    api.addEventListener('bodyScroll', this.onBodyScroll);
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubscribe();
    this.scrollApi?.removeEventListener('bodyScroll', this.onBodyScroll);
    this.scrollApi = null;
    if (this.flushHandle !== null) clearTimeout(this.flushHandle);
    void this.views.clear();
  }

  private async load(params: IServerSideGetRowsParams): Promise<void> {
    const { request } = params;
    this.lastRequest = request;
    this.inFlight++;
    try {
      const query = buildQuery({
        request,
        schema: this.options.schema,
        leafColumns: this.options.leafColumns,
        typedGroupKeys: resolveGroupRoute({
          parentNode: params.parentNode as unknown as RouteNode | null,
          groupColumns: this.groupColumnsFor(request),
          requestKeys: request.groupKeys ?? [],
        }),
      });
      this.lastUnsupportedFilters = query.unsupported;
      if (query.unsupported.length > 0) {
        console.warn(
          'Perspective could not translate these filter conditions exactly, so the ' +
            'result may include rows the filter should have excluded: ' +
            query.unsupported.join(', '),
        );
      }
      if (query.matchNothing) {
        params.success({ rowData: [], rowCount: 0 });
        return;
      }
      const isRoot = (request.groupKeys?.length ?? 0) === 0;
      if (isRoot) this.rootConfig = query.config;
      const result = await this.views.withView(query.config, async (view) => {
        const [columns, rowCount, pivotResultFields] = await Promise.all([
          view.to_columns(windowFor(request)) as Promise<Record<string, unknown[]>>,
          query.shape.kind === 'total' ? Promise.resolve(1) : view.num_rows(),
          request.pivotMode ? (view.column_paths() as Promise<string[]>) : Promise.resolve(undefined),
        ]);
        return { columns, rowCount, pivotResultFields };
      });
      if (isRoot) this.rootCount = result.rowCount;
      const groupKeys = request.groupKeys ?? [];
      const rowData = this.toRows(
        decodeMaxAliases(result.columns, query.maxAliases),
        query,
        groupKeys,
      );
      const grandTotalData = params.needsGrandTotal
        ? await this.loadGrandTotal(query, request)
        : undefined;
      params.success({
        rowData,
        rowCount: result.rowCount,
        pivotResultFields: decodeMaxFields(result.pivotResultFields, query.maxAliases),
        grandTotalData,
        /*
         * Carried back to the grid and readable via
         * `getServerSideGroupLevelState`, so diagnostics can tell whether the
         * level on screen is still the one that was loaded.
         */
        groupLevelInfo: {
          route: groupKeys,
          level: groupKeys.length,
          shape: query.shape.kind,
          rowCount: result.rowCount,
          loadedAt: Date.now(),
        },
      });
    } catch (error) {
      console.error('Perspective server-side request failed:', error);
      params.fail();
    } finally {
      this.inFlight--;
    }
  }

  /**
   * The grand total row. Perspective's `"total"` rollup collapses the whole
   * filtered set to a single aggregate row, which is exactly what the grid
   * wants, so it costs one extra view rather than a second pass over the data.
   */
  private async loadGrandTotal(
    query: PerspectiveQuery,
    request: IServerSideGetRowsRequest,
  ): Promise<Record<string, unknown> | null | undefined> {
    if ((request.groupKeys?.length ?? 0) > 0) return undefined;
    // `null` clears the row; `undefined` would leave a stale total on screen.
    if (query.valueColumns.length === 0) return null;
    /*
     * The aggregates are rebuilt from the request rather than copied from the
     * root query's config. When nothing is grouped, the root query is a *leaf*
     * query and carries no `aggregates` at all — copying that would leave
     * Perspective to apply its own defaults, so a column the user set to `avg`
     * would total as a sum.
     */
    const totals = buildQuery({
      request: {
        ...request,
        groupKeys: [],
        rowGroupCols: [],
        startRow: undefined,
        endRow: undefined,
      },
      schema: this.options.schema,
      leafColumns: this.options.leafColumns,
    });
    const config: ViewConfigUpdate = {
      filter: totals.config.filter,
      expressions: totals.config.expressions,
      columns: totals.valueColumns,
      aggregates: totals.config.aggregates,
      split_by: query.config.split_by,
      group_rollup_mode: 'total',
    };
    return this.views.withView(config, async (view) =>
      mapTotalRow(decodeMaxAliases((await view.to_columns({})) as Columnar, totals.maxAliases)),
    );
  }

  private toRows(
    columns: Columnar,
    query: PerspectiveQuery,
    route: string[],
  ): Record<string, unknown>[] {
    switch (query.shape.kind) {
      case 'leaf':
        return mapLeafRows(columns);
      case 'total':
        return [mapTotalRow(columns, TOTAL_ROW_ID)];
      default:
        return mapGroupRows(columns, query.shape.groupColumn, route);
    }
  }

  /** Row-group column ids in order, for resolving a route off the node chain. */
  private groupColumnsFor(request: IServerSideGetRowsRequest): string[] {
    return request.rowGroupCols.map((col) => col.id);
  }

  // ---------------------------------------------------------------- live data

  private onTableEvent(event: FeedTableEvent): void {
    if (this.destroyed || this.options.liveUpdates === 'off') return;
    if (event.type === 'snapshot') {
      // A snapshot follows a reconnect or refresh, so any block that failed
      // while the feed was down is retried rather than left in its error state.
      this.api?.retryServerSideLoads();
      this.api?.refreshServerSide({ purge: false });
      return;
    }
    for (const id of event.ids) this.pendingIds.add(id);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushHandle !== null) return;
    this.flushHandle = setTimeout(() => {
      this.flushHandle = null;
      void this.flush();
    }, this.options.liveUpdateDebounceMs);
  }

  /*
   * A live update changes two different things, and they need different
   * treatment. Values inside rows already on screen are written straight into
   * their row nodes, which keeps scroll position and fires the cell flash. The
   * shape of the result — how many rows pass the filter, which groups exist —
   * can only be answered by reloading, so that is checked separately and much
   * more cheaply, by comparing the top-level row count.
   */
  private async flush(): Promise<void> {
    const api = this.api;
    const request = this.lastRequest;
    if (this.destroyed || !api || !request || this.flushing) return;
    if (api.isDestroyed()) return;
    if (now() - this.lastScrollAt < SCROLL_QUIESCENCE_MS) {
      // Mid-fling: leave everything pending and try again after the debounce.
      this.scheduleFlush();
      return;
    }
    const ids = this.pendingIds;
    this.pendingIds = new Set();
    this.flushing = true;
    try {
      if (this.options.liveUpdates === 'refresh') {
        api.refreshServerSide({ purge: false });
        return;
      }
      const nodes = api.getRenderedNodes();
      /*
       * Leaf values cost nothing to apply: the feed already carries them, so
       * nothing is asked of the engine and this runs even mid-scroll.
       */
      this.patchLeafRows(nodes, ids);
      /*
       * Aggregates can only come from the engine, so they wait while the grid
       * is still loading blocks — which is the whole of a fling. A row the
       * user is waiting to see beats a total that is a tick out of date.
       */
      if (this.inFlight > 0) {
        this.scheduleFlush();
        return;
      }
      if (await this.rowCountChanged()) {
        // Rows have entered or left the filtered set, so patching values in
        // place would leave the grid showing a stale set of rows.
        api.refreshServerSide({ purge: false });
        return;
      }
      await this.patchAggregates(api, nodes, request);
    } catch (error) {
      console.error('Perspective live update failed:', error);
    } finally {
      this.flushing = false;
      if (this.pendingIds.size > 0) this.scheduleFlush();
    }
  }

  private async rowCountChanged(): Promise<boolean> {
    if (!this.rootConfig || this.rootCount === null) return false;
    const count = await this.views.withView(this.rootConfig, (view) => view.num_rows());
    if (count === this.rootCount) return false;
    this.rootCount = count;
    return true;
  }

  /**
   * Rewrites the values of leaf rows that are on screen.
   *
   * Nothing is asked of the engine: the feed holds the latest row, and
   * `feed.getRow` materialises the grid-ready values ON DEMAND — so the cost
   * here scales with the rendered rows, never with the feed rate. Rows are
   * matched by the index column rather than by position — the server-side row
   * model does not maintain `childIndex`, and identity is the only thing that
   * stays true while the grid is scrolling underneath a pending update.
   *
   * A row that ticked while it was off screen is written when it comes back,
   * which is what the "newly rendered" check is for: its block may have been
   * cached since before the tick.
   */
  private patchLeafRows(nodes: IRowNode[], ids: ReadonlySet<string>): void {
    const renderedIds = new Set<string>();
    for (const node of nodes) {
      if (node.group || !node.data) continue;
      const id = (node.data as Record<string, unknown>)[INDEX_COLUMN];
      if (typeof id !== 'string') continue;
      renderedIds.add(id);
      const row =
        ids.has(id) || !this.lastRenderedIds.has(id) ? this.options.feed.getRow(id) : undefined;
      if (row) node.updateData(row);
    }
    this.lastRenderedIds = renderedIds;
  }

  /**
   * Rewrites the aggregates of the group rows on screen, and the grand total.
   *
   * Aggregates cannot come from the feed — a group total depends on rows that
   * are mostly not loaded — so this reads them back from the view that produced
   * the level, which is already open and already up to date. Rows are matched
   * to nodes by group key, so nothing depends on where the level has moved to.
   */
  private async patchAggregates(
    api: GridApi,
    nodes: IRowNode[],
    request: IServerSideGetRowsRequest,
  ): Promise<void> {
    const groupColumns = this.groupColumnsFor(request);
    const buckets = new Map<string, { route: unknown[]; byKey: Map<string, IRowNode> }>();
    for (const node of nodes) {
      if (!node.group || !node.data) continue;
      const route = routeOf(node, groupColumns);
      const key = routeKey(node.level, route);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { route, byKey: new Map() };
        buckets.set(key, bucket);
      }
      /*
       * Keyed by a type-tagged token on both sides. `node.key` is the raw
       * value, so a numeric or date group level stored a number here and was
       * then looked up by its decimal string — a miss every time, which left
       * live aggregates frozen on exactly the levels most likely to have them.
       * The null group was skipped outright.
       */
      const groupColumn = groupColumns[node.level];
      const raw = groupColumn && node.data ? (node.data as Record<string, unknown>)[groupColumn] : node.key;
      bucket.byKey.set(groupKeyToken(raw), node);
    }
    await Promise.all([
      this.patchGrandTotal(api, request),
      ...[...buckets.values()].map(async (bucket) => {
        const query = buildQuery({
          // Only the length matters here; the typed keys do the filtering.
          request: { ...request, groupKeys: bucket.route.map(String) },
          schema: this.options.schema,
          leafColumns: this.options.leafColumns,
          typedGroupKeys: bucket.route,
        });
        if (query.shape.kind !== 'group' || query.matchNothing) return;
        const columns = await this.views.withView(
          query.config,
          (view) =>
            view.to_columns({ start_row: 0, end_row: GROUP_SCAN_LIMIT }) as Promise<Columnar>,
        );
        const decoded = decodeMaxAliases(columns, query.maxAliases);
        for (const row of mapGroupRows(decoded, query.shape.groupColumn, bucket.route)) {
          const node = bucket.byKey.get(groupKeyToken(row[query.shape.groupColumn]));
          node?.updateData(row);
        }
      }),
    ]);
  }

  /** Keeps the grand total row current, when the grid is showing one. */
  private async patchGrandTotal(api: GridApi, request: IServerSideGetRowsRequest): Promise<void> {
    const node = api.getRowNode(GRAND_TOTAL_ROW_ID);
    if (!node) return;
    const query = buildQuery({
      request: { ...request, groupKeys: [] },
      schema: this.options.schema,
      leafColumns: this.options.leafColumns,
    });
    const total = await this.loadGrandTotal(query, { ...request, groupKeys: [] });
    if (total) node.updateData(total);
  }
}

function windowFor(request: IServerSideGetRowsRequest): { start_row?: number; end_row?: number } {
  // AG Grid leaves both undefined when it wants every row, and its end row is
  // exclusive, which is also how Perspective reads `end_row`.
  const window: { start_row?: number; end_row?: number } = {};
  if (request.startRow !== undefined) window.start_row = request.startRow;
  if (request.endRow !== undefined) window.end_row = request.endRow;
  return window;
}
