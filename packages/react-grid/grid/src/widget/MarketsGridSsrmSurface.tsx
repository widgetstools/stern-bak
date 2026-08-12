/**
 * MarketsGridSsrmSurface — AgGridReact mount for server-side row model.
 *
 * Mirrors {@link MarketsGridSurface} prop plumbing (gridRef, pipeline
 * gridOptions, host overrides, stream-safe filters, scrollbar probe)
 * but wires SSRM datasource + tick binding instead of `rowData`.
 *
 * View-only. Never passes `rowData`. Worker owns calc/style/alerts —
 * expression bindings read enrichment only, no client-side re-apply.
 */

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
  GridApi,
  GridReadyEvent,
  Module,
} from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import type { MarketsGridProps, MarketsGridSsrmProps } from './types';
import { stripSurfaceManagedGridOptions } from './gridSurfaceOptions';
import { buildStreamSafeComponents } from './buildStreamSafeComponents';
import { measureNativeScrollbarWidth } from './nativeScrollbarWidth';
import { useRestoreCellFocusOnWindowFocus } from './useRestoreCellFocusOnWindowFocus';
import { ensureAgGridModules } from './ensureAgGridModules';
import { bindSsrmTicks } from '../ssrm/bindSsrmTicks.js';
import { createSsrmDatasource } from '../ssrm/createSsrmDatasource.js';
import { createSsrmStatusBar } from '../ssrm/createSsrmStatusBar.js';
import { ssrmAlertRowClass, ssrmGetChildCount } from '../ssrm/expressionBindings.js';
import { withSsrmSetFilterValues } from '../ssrm/ssrmSetFilterValues.js';
import { BlankLoadingCellRenderer } from '../ssrm/BlankLoadingCellRenderer.js';
import { ssrmGetRowId as resolveSsrmRowId } from '../ssrm/ssrmGetRowId.js';

/** AG Grid 35+: pass modules to the grid instance (plus global registry). */
const SSRM_AG_GRID_MODULES: Module[] = [AllEnterpriseModule];

const SURFACE_STYLE: CSSProperties = { flex: 1 };

export interface MarketsGridSsrmSurfaceProps<TData> {
  readonly gridRef: RefObject<AgGridReact<TData> | null>;
  readonly gridOptions: Record<string, unknown>;
  readonly hostOverrideKeys: ReadonlySet<string>;
  readonly theme: MarketsGridProps<TData>['theme'];
  readonly columnDefs: unknown[];
  readonly ssrm: MarketsGridSsrmProps;
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
}

function surfacePropsEqual<TData>(
  prev: Readonly<MarketsGridSsrmSurfaceProps<TData>>,
  next: Readonly<MarketsGridSsrmSurfaceProps<TData>>,
): boolean {
  return (
    prev.gridRef === next.gridRef
    && prev.gridOptions === next.gridOptions
    && prev.hostOverrideKeys === next.hostOverrideKeys
    && prev.theme === next.theme
    && prev.columnDefs === next.columnDefs
    && prev.ssrm === next.ssrm
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
  );
}

function resolveCacheBlockSize(
  provider: MarketsGridSsrmProps['provider'],
  cacheBlockSizeProp?: number,
): number {
  if (typeof cacheBlockSizeProp === 'number' && cacheBlockSizeProp >= 20) {
    return cacheBlockSizeProp;
  }
  try {
    const cfg = provider.getConfig() as { blockSize?: number };
    const n = cfg.blockSize;
    return typeof n === 'number' && n >= 20 ? n : 100;
  } catch {
    return 100;
  }
}

export const MarketsGridSsrmSurface = memo(function MarketsGridSsrmSurface<TData>({
  gridRef,
  gridOptions,
  hostOverrideKeys,
  theme,
  columnDefs,
  ssrm,
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
}: MarketsGridSsrmSurfaceProps<TData>) {
  ensureAgGridModules();

  const { provider, keyColumn = 'id', getQuickFilterText, cacheBlockSize: cacheBlockSizeProp } = ssrm;

  const pipelineGridOptions = useMemo(
    () => stripSurfaceManagedGridOptions(gridOptions, hostOverrideKeys),
    [gridOptions, hostOverrideKeys],
  );

  const cacheBlockSize = useMemo(
    () => resolveCacheBlockSize(provider, cacheBlockSizeProp),
    [provider, cacheBlockSizeProp],
  );

  // Set-filter panels list the column's full domain from the worker cache —
  // without this they show only the values present in loaded blocks.
  const ssrmColumnDefs = useMemo(
    () =>
      withSsrmSetFilterValues(
        columnDefs as Parameters<typeof withSsrmSetFilterValues>[0],
        { provider },
      ),
    [columnDefs, provider],
  );

  const statusPack = useMemo(
    () => createSsrmStatusBar({ provider, getQuickFilterText }),
    [provider, getQuickFilterText],
  );

  const mergedStatusBar = useMemo(() => {
    const hostBar = hostOverrideKeys.has('statusBar') ? statusBar : undefined;
    if (!hostBar) return statusPack.statusBar;
    return {
      statusPanels: [
        ...hostBar.statusPanels,
        ...statusPack.statusBar.statusPanels,
      ],
    };
  }, [statusBar, hostOverrideKeys, statusPack]);

  const mergedContext = useMemo(
    () => ({
      ...statusPack.context,
      ...(typeof pipelineGridOptions.context === 'object' && pipelineGridOptions.context != null
        ? pipelineGridOptions.context
        : {}),
    }),
    [statusPack.context, pipelineGridOptions.context],
  );

  const apiRef = useRef<GridApi<TData> | null>(null);
  const unbindRef = useRef<(() => void) | null>(null);

  const unbindTicks = useCallback(() => {
    unbindRef.current?.();
    unbindRef.current = null;
  }, []);

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

  const handleGridReady = useCallback(
    (e: GridReadyEvent<TData>) => {
      apiRef.current = e.api;
      e.api.setGridOption(
        'serverSideDatasource',
        createSsrmDatasource(provider, {
          keyColumn,
          getQuickFilterText,
        }),
      );
      unbindTicks();
      unbindRef.current = bindSsrmTicks(provider, e.api, {
        keyColumn,
        flash: false,
        getQuickFilterText,
      });
      onGridReady(e);
    },
    [provider, keyColumn, getQuickFilterText, onGridReady, unbindTicks],
  );

  const handleGridPreDestroyed = useCallback(() => {
    unbindTicks();
    apiRef.current = null;
    onGridPreDestroyed();
  }, [onGridPreDestroyed, unbindTicks]);

  useEffect(() => () => {
    unbindTicks();
    apiRef.current = null;
  }, [unbindTicks]);

  const getRowId = useCallback(
    (p: { data?: unknown }) => resolveSsrmRowId(p.data, keyColumn),
    [keyColumn],
  );

  return (
    <div ref={surfaceRootRef} style={SURFACE_STYLE}>
      <AgGridReact
        ref={gridRef}
        {...pipelineGridOptions}
        {...hostOverrides}
        theme={theme}
        columnDefs={ssrmColumnDefs as never}
        rowModelType="serverSide"
        cacheBlockSize={cacheBlockSize}
        maxBlocksInCache={20}
        getChildCount={ssrmGetChildCount}
        getRowClass={ssrmAlertRowClass}
        getRowId={getRowId}
        loadingCellRenderer={BlankLoadingCellRenderer}
        statusBar={mergedStatusBar}
        context={mergedContext}
        maintainColumnOrder
        cellSelection={true}
        suppressNoRowsOverlay={true}
        overlayNoRowsTemplate=" "
        scrollbarWidth={measureNativeScrollbarWidth()}
        components={streamSafeComponents}
        getContextMenuItems={getContextMenuItems}
        onGridReady={handleGridReady}
        onGridPreDestroyed={handleGridPreDestroyed}
        modules={SSRM_AG_GRID_MODULES}
      />
    </div>
  );
}, surfacePropsEqual) as <TData>(props: MarketsGridSsrmSurfaceProps<TData>) => ReactElement;
