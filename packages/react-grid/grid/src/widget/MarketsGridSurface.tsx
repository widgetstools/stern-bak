/**
 * MarketsGridSurface — the AgGridReact element with every option the
 * MarketsGrid host wires up: module-pipeline options first, then the
 * explicit prop overrides (rowHeight, headerHeight, animateRows,
 * sideBar, statusBar, defaultColDef), the streaming-safe filter
 * components, and the ready/pre-destroy callbacks.
 *
 * View-only. The ref is forwarded from the parent; controller callbacks
 * (`onGridReady`, `onGridPreDestroyed`) are pre-bound by the parent and
 * passed straight through. The wrapping `<div style={{ flex: 1 }}>` is
 * intentional — AG-Grid requires a flex parent to size itself. The one
 * behavioural hook here is `useRestoreCellFocusOnWindowFocus`, which
 * needs exactly this div (the grid-owned focus scope) plus the grid api,
 * so it lives at the surface rather than the host.
 *
 * Memo'd with referential equality: AgGridReact runs `useEffect([props])`
 * and re-processes every changed prop reference. Parent re-renders that
 * don't change pipeline outputs must not reach the grid.
 */

import {
  memo,
  useCallback,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from 'react';
import { AgGridReact, type AgGridReactProps } from 'ag-grid-react';
import type { GetContextMenuItems, GridReadyEvent } from 'ag-grid-community';
import type { MarketsGridProps } from './types';
import { stripSurfaceManagedGridOptions } from './gridSurfaceOptions';
import { buildStreamSafeComponents } from './buildStreamSafeComponents';
import { measureNativeScrollbarWidth } from './nativeScrollbarWidth';
import { useRestoreCellFocusOnWindowFocus } from './useRestoreCellFocusOnWindowFocus';

export interface MarketsGridSurfaceProps<TData> {
  readonly gridRef: RefObject<AgGridReact<TData> | null>;
  readonly gridOptions: Record<string, unknown>;
  readonly hostOverrideKeys: ReadonlySet<string>;
  readonly theme: MarketsGridProps<TData>['theme'];
  readonly rowData: TData[];
  /**
   * Server-side row model options, spread onto AgGridReact AFTER the pipeline
   * spread so `rowModelType` / `serverSideDatasource` / `getRowId` /
   * `getChildCount` win at mount. When set, `rowData` is withheld from the
   * grid (the two row models are mutually exclusive).
   */
  readonly serverSideGridOptions?: Record<string, unknown>;
  readonly columnDefs: unknown[];
  readonly rowHeight?: number;
  readonly headerHeight?: number;
  readonly animateRows?: boolean;
  readonly sideBar: MarketsGridProps<TData>['sideBar'];
  readonly statusBar: MarketsGridProps<TData>['statusBar'];
  readonly defaultColDef: MarketsGridProps<TData>['defaultColDef'];
  /** Cell right-click menu builder. Must be referentially stable (built with
   *  `useCallback` in the host) so this memo'd surface doesn't make
   *  AgGridReact re-process the option each render. */
  readonly getContextMenuItems?: GetContextMenuItems;
  readonly onGridReady: (event: GridReadyEvent) => void;
  readonly onGridPreDestroyed: () => void;
  /** When false, omit date floating filter from components map if unused. Default true. */
  readonly includeAllStreamSafeFilters?: boolean;
}

const SURFACE_STYLE: CSSProperties = { flex: 1 };

function surfacePropsEqual<TData>(
  prev: Readonly<MarketsGridSurfaceProps<TData>>,
  next: Readonly<MarketsGridSurfaceProps<TData>>,
): boolean {
  return (
    prev.gridRef === next.gridRef
    && prev.gridOptions === next.gridOptions
    && prev.hostOverrideKeys === next.hostOverrideKeys
    && prev.theme === next.theme
    && prev.rowData === next.rowData
    && prev.serverSideGridOptions === next.serverSideGridOptions
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
  );
}

export const MarketsGridSurface = memo(function MarketsGridSurface<TData>({
  gridRef,
  gridOptions,
  hostOverrideKeys,
  theme,
  rowData,
  serverSideGridOptions,
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
}: MarketsGridSurfaceProps<TData>) {
  const pipelineGridOptions = useMemo(
    () => stripSurfaceManagedGridOptions(gridOptions, hostOverrideKeys),
    [gridOptions, hostOverrideKeys],
  );

  // Alt-tab paste fix: OpenFin can drop DOM focus to <body> when the
  // window regains OS focus, leaving the focused cell ring painted but
  // unable to receive Ctrl+V until clicked. Restore real focus to the
  // cell AG Grid still reports as focused.
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
    if (hostOverrideKeys.has('statusBar')) out.statusBar = statusBar;
    if (hostOverrideKeys.has('defaultColDef')) out.defaultColDef = defaultColDef;
    return out;
  }, [
    hostOverrideKeys,
    rowHeight,
    headerHeight,
    animateRows,
    sideBar,
    statusBar,
    defaultColDef,
  ]);

  return (
    <div ref={surfaceRootRef} style={SURFACE_STYLE}>
      <AgGridReact
        ref={gridRef}
        {...pipelineGridOptions}
        {...hostOverrides}
        {...((serverSideGridOptions ?? {}) as unknown as Partial<AgGridReactProps<TData>>)}
        theme={theme}
        rowData={serverSideGridOptions ? undefined : rowData}
        columnDefs={columnDefs as never}
        maintainColumnOrder
        cellSelection={true}
        suppressNoRowsOverlay={true}
        overlayNoRowsTemplate=" "
        // asyncTransactionWaitMillis is pipeline-owned: the
        // general-settings module always emits it (MAX UPDATES / SEC in
        // the grid options editor — default 8/sec → 125 ms batching,
        // 0 = flush ASAP). It rides {...pipelineGridOptions} at mount
        // and post-mount option sync on live edits, like rowBuffer.
        //
        // scrollbarWidth: AG sizes its scroll gutters from a probe div
        // in document.body, which gets the design-system's STYLED
        // scrollbar while grid scrollers are exempt and render NATIVE —
        // the mismatch clipped the native thumb. Measure native
        // ourselves (exempt probe) and hand AG the true width.
        scrollbarWidth={measureNativeScrollbarWidth()}
        components={streamSafeComponents}
        getContextMenuItems={getContextMenuItems}
        onGridReady={onGridReady}
        onGridPreDestroyed={onGridPreDestroyed}
      />
    </div>
  );
}, surfacePropsEqual) as <TData>(props: MarketsGridSurfaceProps<TData>) => ReactElement;
