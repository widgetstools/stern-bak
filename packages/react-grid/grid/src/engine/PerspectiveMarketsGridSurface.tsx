/**
 * Perspective presentation surface — the peer of `MarketsGridSurface`.
 *
 * AG Grid stays the surface; only the row supply changes. The book lives once
 * as a Table in the SharedWorker and this window reads the blocks its viewport
 * asks for, so nothing here ever holds more than a few hundred rows — which is
 * why a second and third blotter open as fast as the first.
 *
 * Everything with a non-obvious rule behind it — per-level refresh, the
 * grand-total transaction, the row count that is illegal while grouping, the
 * refresh throttle, settling every block exactly once — belongs to
 * `createPerspectiveRowEngine`. This file is the mount and the wiring.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellValueChangedEvent,
  GetContextMenuItems,
  GetRowIdParams,
  GridApi,
  GridReadyEvent,
  Theme,
} from 'ag-grid-community';
import {
  createPerspectiveRowEngine,
  GRAND_TOTAL_FLAG,
  GRAND_TOTAL_ROW_ID,
  TREE_GROUP_FIELD,
  TREE_KEY_FIELD,
  type PerspectiveRowEngine,
  type PerspectiveTableLike,
} from '@wellsfargo-starui/grid/perspective';
import { buildStreamSafeComponents } from '../widget/buildStreamSafeComponents.js';
import { stripSurfaceManagedGridOptions } from '../widget/gridSurfaceOptions.js';
import { createPerspectiveEngineHolder } from './perspectiveEngineHolder.js';
import { PerspectiveStatusPanel } from './PerspectiveStatusPanel.js';
import { withPerspectiveSetFilterValues } from './perspectiveSetFilterValues.js';
import type {
  PerspectiveEngineHolder,
  PerspectiveGridContext,
  PerspectiveGridQueries,
} from './types.js';

const NO_HOST_OVERRIDES: ReadonlySet<string> = new Set<string>();

/**
 * How long after the last scroll event live re-reads resume. Long enough to
 * span the gap between wheel notches, short enough that a stopped grid looks
 * live immediately.
 */
const SCROLL_RESUME_MS = 150;

/**
 * Blank stub cells instead of AG's "Loading...".
 *
 * Under the server row model AG paints a stub for every row it has asked for
 * and not yet received, and the default renderer writes "Loading..." into it.
 * On a book scrolled continuously that is a word flickering down the leftmost
 * column on every drag — noise, not information, and the status bar already
 * says whether the grid is loading.
 *
 * Imperative rather than a function component: AG frequently creates the stub
 * before `rowIndex` is assigned, and a functional cell that returns once would
 * never repaint.
 */
class BlankLoadingCellRenderer {
  private readonly eGui: HTMLElement;

  constructor() {
    this.eGui = document.createElement('span');
  }

  init(): void {}

  getGui(): HTMLElement {
    return this.eGui;
  }

  refresh(): boolean {
    return true;
  }

  destroy(): void {}
}

export interface PerspectiveMarketsGridSurfaceHandle {
  getApi(): GridApi | null;
  /** Re-read every level now — after an out-of-band change. */
  refresh(): void;
  /** Pause/resume re-reading when the Table moves. */
  setLive(live: boolean): void;
}

export interface PerspectiveMarketsGridSurfaceProps {
  /** Worker-held Table this window reads. Opened by the host, never built here. */
  table: PerspectiveTableLike;
  /** Index column — also labels the grand total row. */
  keyColumn: string;
  columnDefs: unknown[];
  theme?: Theme;
  rowHeight?: number;
  headerHeight?: number;
  sideBar?: unknown;
  statusBar?: unknown;
  defaultColDef?: unknown;
  includeAllStreamSafeFilters?: boolean;
  onGridReady?: (event: GridReadyEvent) => void;
  onGridPreDestroyed?: () => void;
  /** Coalesce Table updates into at most one re-read per this many ms. */
  refreshMs?: number;
  onError?: (error: unknown) => void;
  /**
   * Module-pipeline grid options, the same object the client surface gets.
   * Spread FIRST so the explicit props below still win — everything set in
   * the customizer reaches this surface too, minus the row-supply mechanics.
   */
  gridOptions?: Record<string, unknown>;
  /** Keys the host passed explicitly; the pipeline must not fight them. */
  hostOverrideKeys?: ReadonlySet<string>;
  /** The AgGridReact ref the host owns — the same one the client surface takes. */
  gridRef?: RefObject<AgGridReact | null>;
  getContextMenuItems?: GetContextMenuItems;
  /**
   * Calculated columns as Perspective expression source, keyed by column id.
   * Published to the worker so their values feed sort, filter, group and
   * aggregate — see `usePerspectiveCalcColumns` for why a client-side getter
   * is a correctness gap here rather than a performance one.
   */
  calcExpressions?: Record<string, string>;
  /** Whole-book questions, answered in the worker. Null disables them. */
  queries?: PerspectiveGridQueries | null;
  /** Tree hierarchy fields, outermost first (AG's server-side tree mode). */
  treeFields?: readonly string[];
  grandTotalRow?: boolean | 'top' | 'bottom' | 'pinnedTop' | 'pinnedBottom';
  groupTotalRow?: 'top' | 'bottom';
}

/**
 * Row ids must be the group PATH, not a leaf key.
 *
 * Group rows carry no key column of their own, so an id derived from it
 * collides across every group at a level — and duplicate ids turn a successful
 * block into a failed one (AG warn 205) rather than warning visibly.
 *
 * Tree rows need the same treatment and cannot get it the same way: in tree
 * mode there ARE no row-group columns, so the `level < groupCols.length` test
 * is false at every depth and every parent would be keyed off the leaf column
 * it does not have. They are recognised by the marker the engine stamps on.
 */
export function makeGetRowId(keyColumn: string) {
  return ({ level, parentKeys = [], data, api }: GetRowIdParams): string => {
    const row = data as Record<string, unknown> | undefined;
    if (row?.[GRAND_TOTAL_FLAG]) return GRAND_TOTAL_ROW_ID;
    if (row?.[TREE_GROUP_FIELD]) {
      return [...parentKeys, row?.[TREE_KEY_FIELD]].join('/');
    }
    const groupCols = api.getRowGroupColumns?.() ?? [];
    if (level < groupCols.length) {
      const field = groupCols[level].getColDef().field;
      return [...parentKeys, field ? row?.[field] : undefined].join('/');
    }
    return [...parentKeys, row?.[keyColumn]].join('/');
  };
}

export const PerspectiveMarketsGridSurface = forwardRef<
  PerspectiveMarketsGridSurfaceHandle,
  PerspectiveMarketsGridSurfaceProps
>(function PerspectiveMarketsGridSurface(props, ref) {
  const { table, keyColumn, refreshMs, onError, queries = null } = props;
  const apiRef = useRef<GridApi | null>(null);
  const [engine, setEngine] = useState<PerspectiveRowEngine | null>(null);

  // Joined so a caller passing a fresh array literal every render does not
  // rebuild the engine — which would tear down every live View per render.
  const treeFieldsKey = (props.treeFields ?? []).join(' ');

  // One engine per Table, rebuilt when the Table changes (a provider restart
  // hands over a new one) and always closed: its Views hold engine memory and
  // are charged on every tick until they are deleted.
  useEffect(() => {
    const treeFields = treeFieldsKey ? treeFieldsKey.split(' ') : undefined;
    const next = createPerspectiveRowEngine({
      table,
      keyColumn,
      refreshMs,
      onError,
      treeFields,
    });
    if (apiRef.current) next.setApi(apiRef.current as never);
    setEngine(next);
    return () => {
      void next.close();
    };
  }, [table, keyColumn, refreshMs, onError, treeFieldsKey]);

  useImperativeHandle(
    ref,
    () => ({
      getApi: () => apiRef.current,
      refresh: () => engine?.refreshNow(),
      setLive: (live: boolean) => engine?.setLive(live),
    }),
    [engine],
  );

  /**
   * The engine reaches the status panel and the module pipeline through the
   * grid `context`. The holder is what makes that survive an engine swap.
   */
  const holderRef = useRef<PerspectiveEngineHolder | null>(null);
  holderRef.current ??= createPerspectiveEngineHolder();
  // In a LAYOUT effect, not during render: `set` notifies synchronously and
  // one subscriber is a status panel — updating it mid-render is the "cannot
  // update a component while rendering another" warning. Layout effects all
  // run before any passive effect, so the holder is current before
  // AgGridReact's own effect creates the grid and instantiates the panel.
  useLayoutEffect(() => {
    holderRef.current!.set(engine);
  }, [engine]);

  // Held in a ref for the same reason the engine is: the query bridge is
  // rebuilt when the provider changes, and `context` is frozen at grid
  // creation — so the context must read it at call time, not capture it.
  const queriesRef = useRef<PerspectiveGridQueries | null>(queries);
  queriesRef.current = queries;

  /**
   * Built once and never rebuilt — AG reads `context` when it CREATES the
   * grid. Every field that can change is therefore a GETTER, so a reader that
   * kept the object it was handed at creation still sees the current value.
   */
  const context = useMemo<PerspectiveGridContext>(() => {
    const holder = holderRef.current!;
    return {
      perspectiveEngineHolder: holder,
      get perspectiveQueries() {
        return queriesRef.current;
      },
      get perspectiveConfigured() {
        return holder.get() !== null;
      },
    };
  }, []);

  const streamSafeComponents = useMemo(
    () =>
      buildStreamSafeComponents(
        props.columnDefs as Parameters<typeof buildStreamSafeComponents>[0],
        props.includeAllStreamSafeFilters ?? true,
      ),
    [props.columnDefs, props.includeAllStreamSafeFilters],
  );

  const getRowId = useMemo(() => makeGetRowId(keyColumn), [keyColumn]);

  // Republish the calculated columns whenever they change — including on the
  // first engine, which is built before the customizer state has been read and
  // therefore starts with none.
  useEffect(() => {
    if (!engine) return;
    void engine.setCalcExpressions(props.calcExpressions ?? {});
  }, [engine, props.calcExpressions]);

  /**
   * Bridge the quick search into the engine.
   *
   * `setGridOption('quickFilterText')` is implemented for the CLIENT row model
   * only; under `serverSide` AG stores it and otherwise ignores it, so the
   * search box did nothing at all on this path.
   *
   * MEASURED: changing that option under `serverSide` fires **`modelUpdated`
   * only** — not `filterChanged`, which is the event you would reach for. And
   * since `modelUpdated` also fires on every block load and every refresh, the
   * comparison below is load-bearing rather than an optimisation: the engine's
   * own purge fires `modelUpdated` again, so without it this loops.
   */
  const lastQuickFilter = useRef('');
  const onModelUpdated = useCallback((event: { api: GridApi }) => {
    const next = (event.api.getGridOption('quickFilterText') ?? '') as string;
    if (next === lastQuickFilter.current) return;
    lastQuickFilter.current = next;
    void holderRef.current?.get()?.setQuickFilter(next);
  }, []);

  /**
   * Set filters get their checkbox list from the worker, not from the rows
   * this window holds — it holds only the loaded blocks, so without this every
   * set-filter menu is empty.
   */
  const columnDefs = useMemo(
    () =>
      withPerspectiveSetFilterValues(props.columnDefs, (colId) =>
        queriesRef.current?.distinctValues(colId) ?? Promise.resolve(null),
      ),
    [props.columnDefs],
  );

  const components = useMemo(
    () => ({ ...streamSafeComponents, perspectiveStatusPanel: PerspectiveStatusPanel }),
    [streamSafeComponents],
  );

  /**
   * Committed edits go to the Table, or they do not survive.
   *
   * Under the server row model `cellValueChanged` still fires, but AG's write
   * lands only on the block-cache row node. The next refresh re-reads that
   * block from the Table and paints the old value back over it — an edit that
   * appears to take and silently reverts a fraction of a second later.
   *
   * Registered with `addEventListener` rather than the `onCellValueChanged`
   * grid option so it COMPOSES: alerts, conditional styling, data-change
   * history and smart-edit all attach to the same event, and an option set
   * here would silently take the slot from a pipeline-supplied one.
   */
  const keyColumnRef = useRef(keyColumn);
  keyColumnRef.current = keyColumn;
  const onCellValueChanged = useCallback((event: CellValueChangedEvent) => {
    const field = event.colDef?.field;
    const row = event.data as Record<string, unknown> | undefined;
    if (!field || !row) return;
    // Neither the grand total nor a group row is a row of the book; both carry
    // aggregates, and upserting one would invent an index value.
    if (row[GRAND_TOTAL_FLAG] || event.node?.group) return;
    holderRef.current
      ?.get()
      ?.applyEdit({ key: row[keyColumnRef.current], field, value: event.newValue });
  }, []);

  /**
   * Do not re-read the book while the user is scrolling.
   *
   * MEASURED, and by far the largest scroll cost on this surface: the live
   * re-read calls `refreshServerSide({ purge: false })`, which invalidates
   * EVERY loaded block and re-requests it — four times a second at the default
   * 250 ms throttle. Scrolling needs that same worker for the blocks it is
   * moving onto, and the engine serializes requests, so the two fight.
   *
   * Pausing is honest rather than a trick: a row that ticks while it is flying
   * past cannot be read anyway, and resuming schedules an immediate refresh so
   * the grid is current the moment the user stops. `bodyScrollEnd` fires
   * per-axis, hence a settle timer rather than resuming on the first one.
   */
  const scrollIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBodyScroll = useCallback(() => {
    const scrolling = holderRef.current?.get();
    if (!scrolling) return;
    if (scrolling.live) scrolling.setLive(false);
    if (scrollIdleTimer.current !== null) clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = setTimeout(() => {
      scrollIdleTimer.current = null;
      // Re-read the holder: an engine swapped out mid-scroll must not be the
      // one resumed.
      holderRef.current?.get()?.setLive(true);
    }, SCROLL_RESUME_MS);
  }, []);

  useEffect(
    () => () => {
      if (scrollIdleTimer.current !== null) clearTimeout(scrollIdleTimer.current);
    },
    [],
  );

  useEffect(
    () => () => {
      const liveApi = apiRef.current;
      if (liveApi && !liveApi.isDestroyed?.()) {
        liveApi.removeEventListener('cellValueChanged', onCellValueChanged);
        liveApi.removeEventListener('modelUpdated', onModelUpdated);
        liveApi.removeEventListener('bodyScroll', onBodyScroll);
      }
    },
    [onCellValueChanged, onModelUpdated, onBodyScroll],
  );

  /**
   * KNOWN GAP, stated here rather than left to be discovered: the OTHER write
   * path is not routed yet.
   *
   * Smart edit, bulk update and history undo/redo never touch the cell editor,
   * so `cellValueChanged` above does not see them. They build a patch list and
   * call `GridApi.applyTransactionAsync` directly (`editing-core/applyPatches`),
   * which under the server row model is not a write path at all — the edit
   * lands on nothing and the next refresh repaints the old value.
   *
   * Routing them needs a seam this repo's `GridPlatform` does not have: those
   * modules hold the raw api, not the platform, so there is nowhere to
   * intercept without either changing every caller in `editing-core` or
   * monkey-patching AG's api. Both are their own change, and doing either
   * badly here would be worse than the gap. `toPerspectiveEdits` exists and is
   * tested for exactly this hand-off when the seam lands.
   *
   * The cell-editor path IS wired (see `onCellValueChanged`), which is the one
   * a user reaches by typing into a cell.
   */

  /**
   * Default to the Perspective status bar. AG's own row-count panels render
   * NOTHING under the server row model, because the rows they would count were
   * never sent to this window.
   */
  const statusBar = useMemo(
    () =>
      props.statusBar ?? {
        statusPanels: [{ statusPanel: 'perspectiveStatusPanel', align: 'left' }],
      },
    [props.statusBar],
  );

  // The shell still carries the legacy boolean form; AG Grid takes a position.
  const grandTotalRow =
    props.grandTotalRow === true
      ? ('pinnedBottom' as const)
      : props.grandTotalRow === false
        ? undefined
        : props.grandTotalRow;

  const pipelineGridOptions = useMemo(
    () =>
      stripSurfaceManagedGridOptions(
        props.gridOptions ?? {},
        props.hostOverrideKeys ?? NO_HOST_OVERRIDES,
      ),
    [props.gridOptions, props.hostOverrideKeys],
  );

  /**
   * Host props are applied only when the host actually passed them. Listing
   * them as always-present JSX attributes would send `undefined` for the ones
   * it omitted, and an explicit `undefined` beats a pipeline value.
   */
  const hostOverrides = useMemo(() => {
    const out: Record<string, unknown> = {};
    if (props.rowHeight !== undefined) out.rowHeight = props.rowHeight;
    if (props.headerHeight !== undefined) out.headerHeight = props.headerHeight;
    if (props.sideBar !== undefined) out.sideBar = props.sideBar;
    // Merged rather than assigned: a host's defaultColDef must survive, and a
    // host setting its own `loadingCellRenderer` still wins.
    out.defaultColDef = {
      loadingCellRenderer: BlankLoadingCellRenderer,
      ...((props.defaultColDef as Record<string, unknown>) ?? {}),
    };
    if (grandTotalRow !== undefined) out.grandTotalRow = grandTotalRow;
    if (props.groupTotalRow !== undefined) out.groupTotalRow = props.groupTotalRow;
    return out;
  }, [
    props.rowHeight,
    props.headerHeight,
    props.sideBar,
    props.defaultColDef,
    grandTotalRow,
    props.groupTotalRow,
  ]);

  const treeProps = useMemo(() => {
    if (!treeFieldsKey) return {};
    return {
      treeData: true,
      isServerSideGroup: (data: Record<string, unknown>) => data[TREE_GROUP_FIELD] === true,
      getServerSideGroupKey: (data: Record<string, unknown>) => String(data[TREE_KEY_FIELD] ?? ''),
    };
  }, [treeFieldsKey]);

  const datasource = useMemo(
    () =>
      engine === null
        ? undefined
        : {
            getRows: (params: Parameters<typeof engine.datasource.getRows>[0]) =>
              engine.datasource.getRows(params),
          },
    [engine],
  );

  // Do not mount the grid until the engine exists. AG reads `context` and
  // `serverSideDatasource` when it CREATES the grid and instantiates status
  // panels once — mounting earlier gave the status panel a null engine, and it
  // then rendered nothing forever even though the engine arrived a tick later.
  // One extra render is the whole cost.
  if (engine === null) {
    return <div style={{ flex: 1, minHeight: 0 }} data-testid="perspective-surface-warming" />;
  }

  return (
    <div style={{ flex: 1, minHeight: 0 }}>
      <AgGridReact
        ref={props.gridRef}
        {...pipelineGridOptions}
        {...hostOverrides}
        theme={props.theme}
        columnDefs={columnDefs as never}
        // Parity with the client surface, which sets all of these
        // unconditionally. They are in SURFACE_FIXED_GRID_OPTION_KEYS so the
        // pipeline's copies are stripped and the surface owns them — omitting
        // them left `cellSelection` off entirely, and the formatting toolbar
        // resolves its target columns from `api.getCellRanges()`.
        maintainColumnOrder
        cellSelection={true}
        getContextMenuItems={props.getContextMenuItems}
        rowModelType="serverSide"
        serverSideDatasource={datasource as never}
        getRowId={getRowId}
        {...(treeProps as Record<string, unknown>)}
        // 100 rows is the window size every measurement behind this engine
        // used, and the depth at which reads stay flat.
        cacheBlockSize={100}
        maxBlocksInCache={20}
        blockLoadDebounceMillis={0}
        statusBar={statusBar as never}
        components={components as Record<string, unknown>}
        context={context}
        suppressAggFuncInHeader
        suppressNoRowsOverlay
        overlayNoRowsTemplate=" "
        onGridReady={(event) => {
          apiRef.current = event.api;
          engine.setApi(event.api as never);
          event.api.addEventListener('cellValueChanged', onCellValueChanged);
          event.api.addEventListener('modelUpdated', onModelUpdated);
          event.api.addEventListener('bodyScroll', onBodyScroll);
          props.onGridReady?.(event);
        }}
        onGridPreDestroyed={props.onGridPreDestroyed}
      />
    </div>
  );
});
