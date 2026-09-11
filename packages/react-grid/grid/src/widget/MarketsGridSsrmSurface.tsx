import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  GetContextMenuItems,
  GridReadyEvent,
  ProcessDataFromClipboardParams,
} from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { MarketsGridProps } from './types';
import { stripSurfaceManagedGridOptions } from './gridSurfaceOptions';
import { buildStreamSafeComponents } from './buildStreamSafeComponents';
import { measureNativeScrollbarWidth } from './nativeScrollbarWidth';
import { useRestoreCellFocusOnWindowFocus } from './useRestoreCellFocusOnWindowFocus';
import { bindSsrmExpressionAggregates } from '../ssrm/bindSsrmExpressionAggregates.js';
import { bindSsrmEdits, ssrmPasteTarget } from '../ssrm/bindSsrmEdits.js';
import { bindSsrmTicks } from '../ssrm/bindSsrmTicks.js';
import { createSsrmDatasource } from '../ssrm/createSsrmDatasource.js';
import { SsrmBlockCache } from '../ssrm/SsrmBlockCache.js';
import { createSsrmGetRowId } from '../ssrm/ssrmGetRowId.js';
import { watchGroupsFromApi } from '../ssrm/watchGroupsFromApi.js';
import { applySsrmStatusBar, useSsrmStatusBar } from '../ssrm/ssrmStatusBar.js';
import {
  withSsrmSetFilterDefaults,
  withSsrmSetFilterValues,
} from '../ssrm/withSsrmSetFilterValues.js';
import { lockSsrmExpressionColumns } from '../ssrm/lockSsrmExpressionColumns.js';
import { sendSsrmClipboard } from '../ssrm/sendSsrmClipboard.js';
import { attachSsrmSession, detachSsrmSession } from '../ssrm/ssrmSession.js';
import { withSsrmSelectAll } from '../ssrm/withSsrmSelectAll.js';
import { wrapSsrmContextMenu } from '../ssrm/wrapSsrmContextMenu.js';
import { SsrmBlankLoadingCellRenderer } from '../ssrm/SsrmBlankLoadingCellRenderer.js';

export interface MarketsGridSsrmConfig {
  provider: ISsrmDataProvider;
  keyColumn?: string | readonly string[];
  cacheBlockSize?: number;
}

export interface MarketsGridSsrmSurfaceProps<TData> {
  readonly gridRef: RefObject<AgGridReact<TData> | null>;
  readonly gridOptions: Record<string, unknown>;
  readonly hostOverrideKeys: ReadonlySet<string>;
  readonly theme: MarketsGridProps<TData>['theme'];
  readonly columnDefs: unknown[];
  readonly rowHeight?: number;
  readonly headerHeight?: number;
  readonly animateRows?: boolean;
  readonly sideBar: MarketsGridProps<TData>['sideBar'];
  readonly statusBar: MarketsGridProps<TData>['statusBar'];
  readonly defaultColDef: MarketsGridProps<TData>['defaultColDef'];
  readonly getContextMenuItems?: GetContextMenuItems;
  readonly onGridReady: (event: GridReadyEvent) => void;
  readonly onGridPreDestroyed: () => void;
  readonly includeAllStreamSafeFilters?: boolean;
  readonly ssrm: MarketsGridSsrmConfig;
}

const SURFACE_STYLE: CSSProperties = { flex: 1 };

/** Engine group rows carry their leaf count as `__count`; AG Grid shows it as "(n)". */
function ssrmChildCount(data: unknown): number {
  const count = (data as { __count?: unknown } | null | undefined)?.__count;
  return typeof count === 'number' ? count : (undefined as unknown as number);
}

type ClipboardHook = (params: ProcessDataFromClipboardParams) => string[][] | null;

/** Referential equality, like `MarketsGridSurface` — AgGridReact re-processes
 *  every changed prop reference, and `ssrm` is rebuilt by the host. */
function ssrmSurfacePropsEqual<TData>(
  prev: Readonly<MarketsGridSsrmSurfaceProps<TData>>,
  next: Readonly<MarketsGridSsrmSurfaceProps<TData>>,
): boolean {
  return (
    prev.gridRef === next.gridRef
    && prev.gridOptions === next.gridOptions
    && prev.hostOverrideKeys === next.hostOverrideKeys
    && prev.theme === next.theme
    && prev.columnDefs === next.columnDefs
    && prev.rowHeight === next.rowHeight
    && prev.headerHeight === next.headerHeight
    && prev.animateRows === next.animateRows
    && prev.sideBar === next.sideBar
    && prev.statusBar === next.statusBar
    && prev.defaultColDef === next.defaultColDef
    && prev.getContextMenuItems === next.getContextMenuItems
    && prev.onGridReady === next.onGridReady
    && prev.onGridPreDestroyed === next.onGridPreDestroyed
    && prev.includeAllStreamSafeFilters === next.includeAllStreamSafeFilters
    && prev.ssrm.provider === next.ssrm.provider
    && prev.ssrm.keyColumn === next.ssrm.keyColumn
    && prev.ssrm.cacheBlockSize === next.ssrm.cacheBlockSize
  );
}

export const MarketsGridSsrmSurface = memo(function MarketsGridSsrmSurface<TData>({
  gridRef,
  gridOptions,
  hostOverrideKeys,
  theme,
  columnDefs,
  rowHeight,
  headerHeight,
  animateRows,
  sideBar,
  statusBar,
  defaultColDef,
  getContextMenuItems,
  onGridReady,
  onGridPreDestroyed,
  includeAllStreamSafeFilters = true,
  ssrm,
}: MarketsGridSsrmSurfaceProps<TData>) {
  const pipelineGridOptions = useMemo(() => {
    const stripped = stripSurfaceManagedGridOptions(gridOptions, hostOverrideKeys);
    // Always surface-owned — spreading the raw `ag*` bar then overwriting
    // it (or letting useGridHost push it) tears the remapped bar down.
    delete stripped.statusBar;
    return stripped;
  }, [gridOptions, hostOverrideKeys]);

  const surfaceRootRef = useRef<HTMLDivElement | null>(null);
  const getGridApi = useCallback(() => gridRef.current?.api ?? null, [gridRef]);
  useRestoreCellFocusOnWindowFocus(surfaceRootRef, getGridApi);

  const streamSafeComponents = useMemo(
    () => buildStreamSafeComponents(
      columnDefs as Parameters<typeof buildStreamSafeComponents>[0],
      includeAllStreamSafeFilters,
    ),
    [columnDefs, includeAllStreamSafeFilters],
  );

  // Set filters can't scan rows under SSRM — their lists come from the worker.
  // Expression / calculated columns are client-only; lock sort/filter/group.
  const ssrmColumnDefs = useMemo(
    () => lockSsrmExpressionColumns(withSsrmSetFilterValues(columnDefs, ssrm.provider)),
    [columnDefs, ssrm.provider],
  );

  const ssrmContextMenu = useMemo(
    () => wrapSsrmContextMenu(getContextMenuItems),
    [getContextMenuItems],
  );

  const ssrmRowSelection = useMemo(
    () => withSsrmSelectAll(pipelineGridOptions.rowSelection),
    [pipelineGridOptions.rowSelection],
  );

  // AG Grid's own quick filter is client-side only, so under SSRM the text
  // has to ride the block request and be matched in the worker cache, where
  // `toViewSpec` expands it into an OR across the provider's `searchColumns`.
  // Read live rather than closing over a value, so the memo'd datasource
  // identity stays stable.
  const getQuickFilterText = useCallback(() => {
    const raw = gridRef.current?.api?.getGridOption('quickFilterText');
    return typeof raw === 'string' ? raw : '';
  }, [gridRef]);

  // One block cache per provider, shared by the datasource (serve / prefetch)
  // and the tick binder (patch by id, clear before anything that moves rows).
  const blockCache = useMemo(() => new SsrmBlockCache(), [ssrm.provider]);
  const datasource = useMemo(
    () => createSsrmDatasource(ssrm.provider, { getQuickFilterText, cache: blockCache }),
    [ssrm.provider, getQuickFilterText, blockCache],
  );
  const getRowId = useMemo(
    () => createSsrmGetRowId(ssrm.keyColumn ?? 'id'),
    [ssrm.keyColumn],
  );

  // A paste over block placeholders writes nothing and says nothing. Refuse
  // it whole rather than land a partial paste that looks complete.
  const innerClipboardHook = pipelineGridOptions.processDataFromClipboard as ClipboardHook | undefined;
  const processDataFromClipboard = useCallback<ClipboardHook>((params) => {
    const target = ssrmPasteTarget(params.api, params.data.length);
    if (target.unloaded > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ssrm] paste refused: ${target.unloaded} of ${target.rows} target rows are not loaded yet. Wait for the rows to fill, then paste again.`,
      );
      return null;
    }
    return innerClipboardHook ? innerClipboardHook(params) : params.data;
  }, [innerClipboardHook]);

  // Built-in panels walk row nodes — under SSRM that's the loaded blocks.
  // Identity is held stable across pipeline ticks that don't change the
  // enabled panel set. Applied via setGridOption (not a React prop) so
  // AgGridReact cannot tear the bar down on unrelated ticks.
  const ssrmStatusBar = useSsrmStatusBar(
    (hostOverrideKeys.has('statusBar') ? statusBar : gridOptions.statusBar) as
      { statusPanels?: Array<{ statusPanel?: unknown }> } | undefined,
    ssrm.provider,
  );
  const statusBarRef = useRef(ssrmStatusBar);
  statusBarRef.current = ssrmStatusBar;

  const handleReady = useCallback((event: GridReadyEvent) => {
    attachSsrmSession(event.api, ssrm.provider);
    applySsrmStatusBar(event.api, statusBarRef.current);
    const offTicks = bindSsrmTicks(ssrm.provider, event.api, { cache: blockCache });
    // Cell edits, pastes and fills go back to the engine so they survive the
    // next tick and reach every grid on the provider.
    const offEdits = bindSsrmEdits(ssrm.provider, event.api);
    const offGroups = watchGroupsFromApi(ssrm.provider, event.api);
    const offExprAgg = bindSsrmExpressionAggregates(ssrm.provider, event.api);
    (event.api as GridReadyEvent['api'] & { __ssrmCleanup?: () => void }).__ssrmCleanup = () => {
      offTicks();
      offEdits();
      offGroups();
      offExprAgg();
      detachSsrmSession(event.api);
    };
    onGridReady(event);
  }, [ssrm.provider, onGridReady, blockCache]);

  useEffect(() => () => {
    const api = gridRef.current?.api as (GridReadyEvent['api'] & { __ssrmCleanup?: () => void }) | undefined;
    api?.__ssrmCleanup?.();
    detachSsrmSession(api);
  }, [gridRef, ssrm.provider]);

  const hostOverrides = useMemo(() => {
    const out: Record<string, unknown> = {};
    if (hostOverrideKeys.has('rowHeight')) out.rowHeight = rowHeight;
    if (hostOverrideKeys.has('headerHeight')) out.headerHeight = headerHeight;
    if (hostOverrideKeys.has('animateRows')) out.animateRows = animateRows;
    if (hostOverrideKeys.has('sideBar')) out.sideBar = sideBar;
    if (hostOverrideKeys.has('defaultColDef')) out.defaultColDef = defaultColDef;
    return out;
  }, [
    hostOverrideKeys,
    rowHeight,
    headerHeight,
    animateRows,
    sideBar,
    defaultColDef,
  ]);

  // Columns that inherit `filter: true` and name no filterParams of their own
  // resolve to a set filter too, and AG Grid doesn't deep-merge filterParams
  // between defaultColDef and colDef — so the default needs its own callback.
  const ssrmDefaultColDef = useMemo(() => {
    const base = withSsrmSetFilterDefaults(
      (hostOverrides.defaultColDef ?? pipelineGridOptions.defaultColDef) as
        Record<string, unknown> | undefined,
      ssrm.provider,
    );
    return {
      ...base,
      loadingCellRenderer: SsrmBlankLoadingCellRenderer,
    };
  }, [hostOverrides.defaultColDef, pipelineGridOptions.defaultColDef, ssrm.provider]);

  // AgGridReact does not reliably forward `statusBar` after mount, and a
  // new prop reference tears the bar down. Push only when the remapped
  // object actually changes (panel set changed).
  useEffect(() => {
    applySsrmStatusBar(gridRef.current?.api, ssrmStatusBar);
  }, [gridRef, ssrmStatusBar]);

  return (
    <div ref={surfaceRootRef} style={SURFACE_STYLE}>
      <AgGridReact
        ref={gridRef}
        {...pipelineGridOptions}
        {...hostOverrides}
        theme={theme}
        columnDefs={ssrmColumnDefs as never}
        defaultColDef={ssrmDefaultColDef as never}
        rowModelType="serverSide"
        suppressServerSideFullWidthLoadingRow
        loadingCellRenderer={SsrmBlankLoadingCellRenderer}
        cacheBlockSize={ssrm.cacheBlockSize ?? 200}
        serverSideDatasource={datasource}
        getRowId={getRowId}
        getChildCount={ssrmChildCount}
        processDataFromClipboard={processDataFromClipboard}
        maintainColumnOrder
        cellSelection={true}
        enableAdvancedFilter={false}
        rowSelection={ssrmRowSelection as never}
        sendToClipboard={sendSsrmClipboard}
        suppressNoRowsOverlay={true}
        overlayNoRowsTemplate=" "
        scrollbarWidth={measureNativeScrollbarWidth()}
        components={streamSafeComponents}
        getContextMenuItems={ssrmContextMenu}
        onGridReady={handleReady}
        onGridPreDestroyed={onGridPreDestroyed}
      />
    </div>
  );
}, ssrmSurfacePropsEqual) as <TData>(props: MarketsGridSsrmSurfaceProps<TData>) => ReactElement;
