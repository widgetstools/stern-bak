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
} from 'ag-grid-community';
import type { MarketsGridProps, MarketsGridSsrmProps } from './types';
import { stripSurfaceManagedGridOptions } from './gridSurfaceOptions';
import { buildStreamSafeComponents } from './buildStreamSafeComponents';
import { measureNativeScrollbarWidth } from './nativeScrollbarWidth';
import { useRestoreCellFocusOnWindowFocus } from './useRestoreCellFocusOnWindowFocus';
import { ensureAgGridModules } from './ensureAgGridModules';
import { useOptionalGridPlatform } from '../customizer/hooks/GridProvider';
import { bindSsrmTicks } from '../ssrm/bindSsrmTicks.js';
import { createSsrmDatasource } from '../ssrm/createSsrmDatasource.js';
import { createSsrmStatusBar, mapNativeStatusBarToSsrm } from '../ssrm/createSsrmStatusBar.js';
import {
  ssrmAlertRowClass,
  ssrmGetChildCount,
  withSsrmDefaultColDef,
  withSsrmExpressionBindings,
  type SsrmBindableColDef,
} from '../ssrm/expressionBindings.js';
import { withSsrmSetFilterValues } from '../ssrm/ssrmSetFilterValues.js';
import { BlankLoadingCellRenderer } from '../ssrm/BlankLoadingCellRenderer.js';
import { ssrmGetRowId as resolveSsrmRowId } from '../ssrm/ssrmGetRowId.js';

const SURFACE_STYLE: CSSProperties = { flex: 1 };

/** Sentinel: "no statusBar value has reached the grid api yet" — forces
 *  the gridReady catch-up push to apply whatever is latest. */
const STATUS_BAR_UNPUSHED = Symbol('statusBar-unpushed');

/** "Bar off" is an EMPTY panel list, never `undefined`: AG Grid only
 *  creates the status-bar container when the option is set at init, and
 *  keeps the container when the option is cleared at runtime. Passing an
 *  empty list at init + toggling the strip's visibility below makes
 *  SHOW STATUS BAR work in both directions without a grid remount. */
const EMPTY_STATUS_BAR = { statusPanels: [] as never[] };

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
  // Null-safe read: pre-start this is null (the container remounts-by-key
  // or re-props once ready, so a declared blockSize still lands). The old
  // try/catch swallowed the pre-start throw into a permanent 100 —
  // indistinguishable from a malformed config.
  const cfg = provider.getConfigOrNull?.() as { blockSize?: number } | null;
  const n = cfg?.blockSize;
  return typeof n === 'number' && n >= 20 ? n : 100;
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
  // Fallback for a surface mounted OUTSIDE `MarketsGrid` (tests, bare
  // embeds). Under `MarketsGrid` the shell has already called this with the
  // host's `agGridModules`, and registration latches after the first call,
  // so this is a no-op there. Deliberately no grid-INSTANCE `modules` prop:
  // instance modules are additive, so the `[AllEnterpriseModule]` that used
  // to sit on `<AgGridReact>` handed every SSRM grid the full bundle and
  // made a reduced `agGridModules` silently inert. The global registry is
  // the single source, exactly as `MarketsGridSurface` has always done it.
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

  // Two worker-backed column decorations, in one place:
  //  - set-filter panels list the column's full domain from the worker cache
  //    (without this they show only the values present in loaded blocks);
  //  - `cellStyle` / `editable` pick up the worker's per-cell enrichment
  //    (`__ssrmStyle` / `__ssrmEditable`), which nothing consumed before.
  const ssrmColumnDefs = useMemo(
    () =>
      withSsrmExpressionBindings(
        withSsrmSetFilterValues(
          columnDefs as Parameters<typeof withSsrmSetFilterValues>[0],
          { provider },
        ) as SsrmBindableColDef[],
      ),
    [columnDefs, provider],
  );

  const statusPack = useMemo(
    () => createSsrmStatusBar({ provider, getQuickFilterText }),
    [provider, getQuickFilterText],
  );

  // Customizer Grid Options → STATUS BAR card: the pipeline emits AG
  // Grid's native panel selection. JSON-key it so unrelated pipeline
  // ticks (fresh object, identical content) don't rebuild the bar.
  const pipelineStatusBarJson = useMemo(() => {
    const raw = (gridOptions as { statusBar?: unknown }).statusBar;
    return raw === undefined ? null : JSON.stringify(raw);
  }, [gridOptions]);

  const mergedStatusBar = useMemo(() => {
    // A statusBar passed as a host PROP keeps its historical behaviour:
    // its panels prepended to the full SSRM pack. (`statusBar` is in
    // hostOverrideKeys for every SSRM grid — the surface owns the key —
    // so presence of the prop value is the real discriminator.)
    const hostBar = statusBar != null && hostOverrideKeys.has('statusBar') ? statusBar : undefined;
    if (hostBar) {
      return {
        statusPanels: [
          ...hostBar.statusPanels,
          ...statusPack.statusBar.statusPanels,
        ],
      };
    }
    // Customizer selection: map the native count panels onto their
    // worker-backed SSRM equivalents (the native ones only see loaded
    // blocks). Absent key = SHOW STATUS BAR toggled off → no bar,
    // exactly like CSRM.
    if (pipelineStatusBarJson == null) return undefined;
    return mapNativeStatusBarToSsrm(JSON.parse(pipelineStatusBarJson), {
      provider,
      getQuickFilterText,
    });
  }, [statusBar, hostOverrideKeys, statusPack, pipelineStatusBarJson, provider, getQuickFilterText]);

  // `statusBar` is skipped by useGridHost's generic option sync for SSRM
  // grids (the raw native panels must never land), so the surface pushes
  // its own mapped value. A value is recorded as applied ONLY when it
  // actually reached a live grid api — recording before the api check
  // silently swallowed any change that landed while the grid was still
  // initialising (profile hydration routinely beats gridReady), which
  // made customizer STATUS BAR edits apply intermittently. gridReady
  // runs a catch-up push so everything from that window lands.
  const latestStatusBarRef = useRef<unknown>(mergedStatusBar);
  latestStatusBarRef.current = mergedStatusBar;
  const appliedStatusBarRef = useRef<unknown>(STATUS_BAR_UNPUSHED);
  const pushStatusBar = useCallback(() => {
    if (Object.is(appliedStatusBarRef.current, latestStatusBarRef.current)) return;
    const api = apiRef.current as unknown as {
      isDestroyed?: () => boolean;
      setGridOption?: (key: string, value: unknown) => void;
    } | null;
    if (!api || api.isDestroyed?.()) return;
    appliedStatusBarRef.current = latestStatusBarRef.current;
    const next = latestStatusBarRef.current as typeof EMPTY_STATUS_BAR | undefined;
    api.setGridOption?.('statusBar', next ?? EMPTY_STATUS_BAR);
    // AG Grid keeps (or re-fills) the container element; the strip's
    // visibility is ours. Hidden entirely when the card toggles the bar off.
    const strip = surfaceRootRef.current?.querySelector('.ag-status-bar') as HTMLElement | null;
    if (strip) strip.style.display = next && next.statusPanels.length > 0 ? '' : 'none';
  }, []);
  useEffect(() => {
    pushStatusBar();
  }, [mergedStatusBar, pushStatusBar]);

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
  // Optional: the surface renders standalone in tests and in a bare embed.
  // Inside `MarketsGrid` it is always under a `<GridProvider>`.
  const platform = useOptionalGridPlatform();

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

  // The editable gate has to sit on `defaultColDef` as well as on the columns
  // that declare their own — `general-settings` writes editability to the
  // defaults, and a per-column wrapper would shadow it. Whichever of the two
  // sources actually reaches the grid is the one decorated, so the wrapper is
  // never applied twice.
  const ssrmDefaultColDef = useMemo(
    () =>
      withSsrmDefaultColDef(
        (hostOverrides.defaultColDef
          ?? (pipelineGridOptions as { defaultColDef?: unknown }).defaultColDef) as
          SsrmBindableColDef | undefined,
      ),
    [hostOverrides, pipelineGridOptions],
  );

  // ── Late-bound key column ─────────────────────────────────────────
  //
  // `keyColumn` starts as the fallback 'id' and resolves (e.g. to
  // 'positionId') once the provider is ready. The grid is created ONCE:
  // `getRowId` is an init-only AG Grid option, but only the FUNCTION is
  // captured at init — it reads the ref, so the resolved key takes
  // effect without a remount. The datasource and the tick binding are
  // runtime-settable, so a keyColumn change rebinds them and purges
  // every block; no row can exist under the old identity because rows
  // only load once the provider is ready, and ready both triggers the
  // resolve and purges (bindSsrmTicks' status subscription).
  const keyColumnRef = useRef(keyColumn);
  keyColumnRef.current = keyColumn;
  /** keyColumn the live datasource/ticks were bound with. */
  const boundKeyColumnRef = useRef<string | null>(null);

  const bindDataPath = useCallback(
    (api: GridApi<TData>) => {
      boundKeyColumnRef.current = keyColumnRef.current;
      api.setGridOption(
        'serverSideDatasource',
        createSsrmDatasource(provider, {
          keyColumn: keyColumnRef.current,
          getQuickFilterText,
        }),
      );
      unbindTicks();
      unbindRef.current = bindSsrmTicks(provider, api, {
        keyColumn: keyColumnRef.current,
        flash: false,
        getQuickFilterText,
        // The tick binding is the platform's only delta source under this row
        // model — `applyServerSideTransaction` fires no flush event for
        // `RowChangeBus` to hear. `null` only when the surface is mounted
        // outside a `<GridProvider>`, which has no subscribers either.
        rows: platform?.rows,
      });
    },
    [provider, getQuickFilterText, unbindTicks, platform],
  );

  const handleGridReady = useCallback(
    (e: GridReadyEvent<TData>) => {
      apiRef.current = e.api;
      // Catch-up: apply whatever statusBar value is latest — changes that
      // landed while the grid was initialising never reached an api.
      pushStatusBar();
      bindDataPath(e.api);
      onGridReady(e);
    },
    [bindDataPath, onGridReady, pushStatusBar],
  );

  // keyColumn resolved after the grid was already bound → rebind the
  // datasource + ticks under the new key and reload every block.
  useEffect(() => {
    const api = apiRef.current;
    if (!api || (api as { isDestroyed?: () => boolean }).isDestroyed?.()) return;
    if (boundKeyColumnRef.current === null) return; // not bound yet — gridReady will bind
    if (boundKeyColumnRef.current === keyColumn) return;
    bindDataPath(api);
    try {
      (api as { refreshServerSide?: (p?: { purge?: boolean }) => void }).refreshServerSide?.({ purge: true });
    } catch {
      /* grid mid-teardown */
    }
  }, [keyColumn, bindDataPath]);

  const handleGridPreDestroyed = useCallback(() => {
    unbindTicks();
    apiRef.current = null;
    onGridPreDestroyed();
  }, [onGridPreDestroyed, unbindTicks]);

  useEffect(() => () => {
    unbindTicks();
    apiRef.current = null;
  }, [unbindTicks]);

  // Stable identity, live key: AG Grid captures this function at init
  // (getRowId is init-only) — reading the ref lets the resolved
  // keyColumn apply without remounting the grid.
  const getRowId = useCallback(
    (p: { data?: unknown }) => resolveSsrmRowId(p.data, keyColumnRef.current),
    [],
  );

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
        cacheBlockSize={cacheBlockSize}
        maxBlocksInCache={20}
        getChildCount={ssrmGetChildCount}
        getRowClass={ssrmAlertRowClass}
        getRowId={getRowId}
        loadingCellRenderer={BlankLoadingCellRenderer}
        statusBar={mergedStatusBar ?? EMPTY_STATUS_BAR}
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
      />
    </div>
  );
}, surfacePropsEqual) as <TData>(props: MarketsGridSsrmSurfaceProps<TData>) => ReactElement;
