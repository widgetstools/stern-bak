import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type ReactElement,
  type RefAttributes,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, GridReadyEvent } from 'ag-grid-community';
import type { Module } from 'ag-grid-community';
import { useGridTheme } from './theme/useGridTheme.js';
import {
  applyGridDensityToTheme,
  resolveGridDensity,
} from '@wellsfargo-starui/design-system/adapters/ag-grid';
import type { Theme } from 'ag-grid-community';
import { useGeneralSettingsSnapshot } from './useGeneralSettingsSnapshot';
import { type AnyModule, type StorageAdapter } from '@wellsfargo-starui/core';
import {
  GridProvider,
  ProviderGridHostProvider,
  type ProviderGridHostApi,
  GridEventBindingsHostProvider,
  type GridEventBindingsHostApi,
} from '../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { useEditWriteBack } from '../customizer/hooks/useEditWriteBack.js';
import type { MarketsGridHandle, MarketsGridProps } from './types';
import { isMarketsGridLocalStorageStorageFactory } from './createMarketsGridLocalStorageStorage';
import { useGridHost } from './useGridHost';
import { resolveMarketsGridHost } from './resolveMarketsGridHost';
import { resolveSurfaceHostOverrideKeys } from './gridSurfaceOptions';
import { MarketsGridHost } from './MarketsGridHost';
import { todayIsoDate, type ToolbarIsoDate } from './toolbarDateUtils';
import { DEFAULT_MODULES } from './modules';
import { ensureAgGridModules } from './ensureAgGridModules';
import { mergeDefaultColDef } from './mergeDefaultColDef';
import { GeneralSettingsProvider } from './GeneralSettingsContext';
import { MarketsGridSurface } from './MarketsGridSurface';
import { MarketsGridSsrmSurface } from './MarketsGridSsrmSurface';
import { resolveMarketsGridSurfaceKind } from './MarketsGridHost';
import { resolveSsrmWithQuickFilter } from './resolveSsrmWithQuickFilter.js';
import { useSsrmExpressionBridge } from './useSsrmExpressionBridge.js';
import { useSsrmDataBinding } from './useSsrmDataBinding';
import type { MarketsGridSsrmProps } from './types';

export { DEFAULT_MODULES } from './modules';

/** Inside {@link GridProvider} so {@link useModuleState} resolves. */
function MarketsGridSsrmExpressionBridge({
  ssrm,
}: {
  ssrm?: MarketsGridSsrmProps;
}): null {
  useSsrmExpressionBridge(ssrm?.provider, Boolean(ssrm?.provider));
  return null;
}

// One-shot dev-only warning when the host forgets to pass `storage`
// (or the legacy `storageAdapter`). Module-scoped so the message fires
// at most once per page session even across many grid mounts. Reset
// only if the module is reloaded (HMR / a fresh page).
let _memoryAdapterWarned = false;

/** Shared inner implementation for {@link MarketsGrid} and {@link MarketsGridCore}. */
function useMarketsGridShell<TData>(
  props: MarketsGridProps<TData>,
) {
  const {
    rowData,
    ssrm,
    columnDefs: baseColumnDefs,
    theme: themeProp,
    gridId,
    rowIdField = 'id',
    appData,
    modules = DEFAULT_MODULES,
    rowHeight,
    headerHeight,
    animateRows,
    sideBar,
    statusBar,
    defaultColDef,
    agGridModules,
    sizeColumnsToFitOnReady = false,
    includeAllStreamSafeFilters = true,
    storageAdapter,
    instanceId,
    appId,
    userId,
    storage,
    host,
    style,
    dataStale = false,
    historicalViewMode = false,
    onGridReady: onGridReadyProp,
  } = props;

  ensureAgGridModules(agGridModules as readonly Module[] | undefined);

  const effectiveInstanceId = instanceId ?? gridId;

  const hostResolved = resolveMarketsGridHost(host, {
    appId,
    userId,
    instanceId: effectiveInstanceId,
    gridId,
    appData,
  });

  const resolvedAppId = hostResolved.appId ?? appId;
  const resolvedUserId = hostResolved.userId ?? userId;
  const resolvedInstanceId = hostResolved.instanceId ?? effectiveInstanceId;
  const resolvedAppData = hostResolved.appData ?? appData;

  const hostOverrideKeys = useMemo(
    () => {
      const keys = resolveSurfaceHostOverrideKeys({
        rowHeight,
        headerHeight,
        animateRows,
        sideBar,
        statusBar,
        defaultColDef,
      });
      // BOTH surfaces own `statusBar` end-to-end (see `useStatusBarStrip`).
      // The server-side one maps the customizer's native panel selection
      // onto worker-backed panels, and the generic post-mount sync must
      // never write the raw native set there (native count components only
      // see loaded blocks). The client-side one needs ownership for a
      // different reason: that sync iterates `Object.entries(gridOptions)`,
      // so the key DISAPPEARING when SHOW STATUS BAR is toggled off was
      // never visited and never pushed, and the bar stayed visible.
      const withStatusBar = new Set(keys);
      withStatusBar.add('statusBar');
      return withStatusBar;
    },
    [rowHeight, headerHeight, animateRows, sideBar, statusBar, defaultColDef],
  );

  // `platform.data` reads and writes through the SharedWorker query plane
  // whenever this grid is server-side.
  const ssrmDataBinding = useSsrmDataBinding(ssrm);

  const { platform, columnDefs, gridOptions, onGridReady, onGridPreDestroyed } = useGridHost({
    gridId,
    rowIdField,
    modules,
    baseColumnDefs: baseColumnDefs as never,
    appData: resolvedAppData,
    hostOverrideKeys,
    ssrm: ssrmDataBinding,
  });

  const internalTheme = useGridTheme();
  const generalSettings = useGeneralSettingsSnapshot(platform);
  const gridDensity = resolveGridDensity(generalSettings);
  const effRowHeight = hostOverrideKeys.has('rowHeight')
    ? rowHeight
    : generalSettings?.rowHeight;
  const effHeaderHeight = hostOverrideKeys.has('headerHeight')
    ? headerHeight
    : generalSettings?.headerHeight;
  const theme = useMemo(() => {
    const base = (themeProp ?? internalTheme) as Theme;
    const densityTheme = applyGridDensityToTheme(base, gridDensity);
    const overrides: Record<string, number> = {};
    if (typeof effRowHeight === 'number') overrides.rowHeight = effRowHeight;
    if (typeof effHeaderHeight === 'number') overrides.headerHeight = effHeaderHeight;
    if (Object.keys(overrides).length === 0 || typeof densityTheme?.withParams !== 'function') {
      return densityTheme;
    }
    return densityTheme.withParams(overrides);
  }, [themeProp, internalTheme, gridDensity, effRowHeight, effHeaderHeight]);

  const editLockedRef = useRef(dataStale || historicalViewMode);
  editLockedRef.current = dataStale || historicalViewMode;

  const applyEditLockGuard = useCallback((api: GridReadyEvent['api']) => {
    const locked = editLockedRef.current;
    api.setGridOption('readOnlyEdit', locked);
    api.setGridOption('suppressClickEdit', locked);
    if (locked) {
      api.stopEditing();
    }
  }, []);

  useEffect(() => {
    const api = platform.api.api;
    if (!api) return;
    if ((api as unknown as { isDestroyed?: () => boolean }).isDestroyed?.()) return;
    applyEditLockGuard(api);
  }, [platform, dataStale, historicalViewMode, applyEditLockGuard]);

  const effectiveDefaultColDef = useMemo(
    (): ColDef<TData> | undefined =>
      mergeDefaultColDef(
        gridOptions.defaultColDef as ColDef<TData> | undefined,
        defaultColDef as ColDef<TData> | undefined,
      ),
    [gridOptions.defaultColDef, defaultColDef],
  );

  const handleGridReady = useCallback(
    (event: GridReadyEvent) => {
      onGridReady(event);
      applyEditLockGuard(event.api);
      if (sizeColumnsToFitOnReady) {
        const suppressAll = event.api.getColumns()?.every((col) => {
          const def = col.getColDef();
          return def.suppressSizeToFit === true;
        });
        if (!suppressAll) {
          event.api.sizeColumnsToFit();
        }
      }
      onGridReadyProp?.(event);
    },
    [onGridReady, onGridReadyProp, applyEditLockGuard, sizeColumnsToFitOnReady],
  );

  const rootStyle = useMemo(
    () => ({ display: 'flex', flexDirection: 'column' as const, height: '100%', ...style }),
    [style],
  );

  const resolvedAdapter = useMemo<StorageAdapter | undefined>(() => {
    if (storage) {
      return storage({
        instanceId: resolvedInstanceId,
        appId: resolvedAppId,
        userId: resolvedUserId,
        gridId,
      });
    }
    return resolveMarketsGridHost(host, {
      appId: resolvedAppId,
      userId: resolvedUserId,
      instanceId: resolvedInstanceId,
      gridId,
      storageAdapter: storageAdapter as StorageAdapter | undefined,
    }).storageAdapter;
  }, [storage, storageAdapter, host, resolvedInstanceId, resolvedAppId, resolvedUserId, gridId]);

  return {
    platform,
    columnDefs,
    gridOptions,
    onGridPreDestroyed,
    handleGridReady,
    theme,
    generalSettings,
    hostOverrideKeys,
    effectiveDefaultColDef,
    rootStyle,
    resolvedAdapter,
    resolvedAppId,
    resolvedUserId,
    resolvedInstanceId,
    includeAllStreamSafeFilters,
    ssrm,
  };
}

function MarketsGridInner<TData = unknown>(
  props: MarketsGridProps<TData>,
  ref: ForwardedRef<MarketsGridHandle>,
) {
  const {
    rowData,
    rowHeight,
    headerHeight,
    animateRows,
    sideBar,
    statusBar,
    showToolbar = true,
    showFiltersToolbar = false,
    showFormattingToolbar = false,
    showEditingToolbar,
    showSaveButton = true,
    showSettingsButton = true,
    showVisualExcelExport = true,
    showProfileSelector = true,
    modules = DEFAULT_MODULES,
    autoSaveDebounceMs,
    className,
    gridId,
    onReady,
    adminActions,
    gridLevelData,
    onGridLevelDataLoad,
    headerExtras,
    providerGridHost,
    gridEventBindingsHost,
    componentName,
    caption,
    tabsHidden,
    onCaptionChange,
    onSavingChange,
    dataStale = false,
    dataStaleMessage,
    historicalViewMode = false,
    historicalViewMessage,
    toolbarDate: toolbarDateProp,
    onToolbarDateChange,
    toolbarDateHistoryEnabled,
    toolbarActionsLayout = 'overflow',
    storage,
    storageAdapter,
    host,
    includeAllStreamSafeFilters,
  } = props;

  const [internalToolbarDate, setInternalToolbarDate] = useState(todayIsoDate);
  const toolbarDate = toolbarDateProp ?? internalToolbarDate;
  const handleToolbarDateChange = useCallback(
    (next: string) => {
      if (toolbarDateProp === undefined) {
        setInternalToolbarDate(next as ToolbarIsoDate);
      }
      onToolbarDateChange?.(next);
    },
    [toolbarDateProp, onToolbarDateChange],
  );

  const gridRef = useRef<AgGridReact<TData>>(null);

  const shell = useMarketsGridShell(props);

  // Reached through the per-grid registry rather than a prop, because the
  // inline cell editor journals from a column transform that holds neither
  // the props nor the data port.
  useEditWriteBack(shell.platform, props.editWriteBack);

  const readQuickFilterText = useCallback(
    () => String(gridRef.current?.api?.getGridOption('quickFilterText') ?? ''),
    [],
  );
  const ssrm = useMemo(
    () => resolveSsrmWithQuickFilter(shell.ssrm, readQuickFilterText),
    [shell.ssrm, readQuickFilterText],
  );

  if (
    storage &&
    (!shell.resolvedAppId || !shell.resolvedUserId) &&
    !isMarketsGridLocalStorageStorageFactory(storage)
  ) {
    throw new Error(
      '<MarketsGrid storage={...}> requires `appId` and `userId` props unless `storage` is ' +
        '`createMarketsGridLocalStorageStorage()`. ConfigService-backed factories scope rows by ' +
        '(appId, userId, instanceId); without both identities the factory cannot produce a correctly-scoped adapter. ' +
        `Received: appId=${JSON.stringify(shell.resolvedAppId)}, userId=${JSON.stringify(shell.resolvedUserId)}.`,
    );
  }

  if (
    !storage &&
    !storageAdapter &&
    !host &&
    !_memoryAdapterWarned &&
    typeof process !== 'undefined' &&
    process.env?.NODE_ENV !== 'production'
  ) {
    _memoryAdapterWarned = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[MarketsGrid] No storage prop provided. Using in-memory storage — ' +
      'profiles, layouts and grid-level-data WILL be lost on reload. ' +
      'Wire @wellsfargo-starui/core/host/config via createConfigServiceStorage(...) or pass `host` with storage to persist.',
    );
  }

  return (
    <ProviderGridHostProvider value={providerGridHost ?? null}>
    <GridEventBindingsHostProvider value={gridEventBindingsHost ?? null}>
      <GridProvider platform={shell.platform}>
      <GeneralSettingsProvider value={shell.generalSettings}>
      <MarketsGridSsrmExpressionBridge ssrm={shell.ssrm} />
      <MarketsGridHost
        rowData={rowData ?? []}
        ssrm={ssrm}
        columnDefs={shell.columnDefs}
        gridOptions={shell.gridOptions}
        hostOverrideKeys={shell.hostOverrideKeys}
        handleGridReady={shell.handleGridReady}
        onGridPreDestroyed={shell.onGridPreDestroyed}
        theme={shell.theme}
        gridId={gridId}
        rowHeight={rowHeight}
        headerHeight={headerHeight}
        animateRows={animateRows}
        sideBar={sideBar}
        statusBar={statusBar}
        defaultColDef={shell.effectiveDefaultColDef}
        showToolbar={showToolbar}
        showFiltersToolbar={showFiltersToolbar}
        showFormattingToolbar={showFormattingToolbar}
        showEditingToolbar={showEditingToolbar}
        showSaveButton={showSaveButton}
        showSettingsButton={showSettingsButton}
        showVisualExcelExport={showVisualExcelExport}
        showProfileSelector={showProfileSelector}
        modules={modules}
        className={className}
        rootStyle={shell.rootStyle}
        gridRef={gridRef}
        storageAdapter={shell.resolvedAdapter}
        autoSaveDebounceMs={autoSaveDebounceMs}
        forwardedRef={ref}
        onReady={onReady}
        adminActions={adminActions}
        gridLevelData={gridLevelData}
        onGridLevelDataLoad={onGridLevelDataLoad}
        headerExtras={headerExtras}
        componentName={componentName}
        instanceId={shell.resolvedInstanceId}
        appId={shell.resolvedAppId}
        userId={shell.resolvedUserId}
        caption={caption}
        tabsHidden={tabsHidden}
        onCaptionChange={onCaptionChange}
        onSavingChange={onSavingChange}
        dataStale={dataStale}
        dataStaleMessage={dataStaleMessage}
        historicalViewMode={historicalViewMode}
        historicalViewMessage={historicalViewMessage}
        toolbarDate={toolbarDate}
        onToolbarDateChange={handleToolbarDateChange}
        toolbarDateHistoryEnabled={toolbarDateHistoryEnabled}
        toolbarActionsLayout={toolbarActionsLayout}
        includeAllStreamSafeFilters={includeAllStreamSafeFilters ?? true}
      />
      </GeneralSettingsProvider>
    </GridProvider>
    </GridEventBindingsHostProvider>
    </ProviderGridHostProvider>
  );
}

/**
 * Grid platform + memo'd AG Grid surface only — no toolbar, settings, or
 * profile chrome. Same engine pipeline wiring as {@link MarketsGrid}.
 */
function MarketsGridCoreInner<TData = unknown>(
  props: MarketsGridProps<TData>,
  _ref: ForwardedRef<MarketsGridHandle>,
) {
  const {
    rowData,
    rowHeight,
    headerHeight,
    animateRows,
    sideBar,
    statusBar,
    gridId,
    className,
    includeAllStreamSafeFilters,
  } = props;

  const gridRef = useRef<AgGridReact<TData>>(null);
  const shell = useMarketsGridShell(props);

  // Reached through the per-grid registry rather than a prop, because the
  // inline cell editor journals from a column transform that holds neither
  // the props nor the data port.
  useEditWriteBack(shell.platform, props.editWriteBack);

  const readQuickFilterText = useCallback(
    () => String(gridRef.current?.api?.getGridOption('quickFilterText') ?? ''),
    [],
  );
  const ssrm = useMemo(
    () => resolveSsrmWithQuickFilter(shell.ssrm, readQuickFilterText),
    [shell.ssrm, readQuickFilterText],
  );
  const surfaceKind = resolveMarketsGridSurfaceKind({ ssrm, rowData });

  return (
    <GridProvider platform={shell.platform}>
      <GeneralSettingsProvider value={shell.generalSettings}>
        <MarketsGridSsrmExpressionBridge ssrm={ssrm} />
        <div className={className} style={shell.rootStyle} data-grid-id={gridId}>
          {surfaceKind === 'ssrm' && ssrm ? (
            <MarketsGridSsrmSurface
              // Keyed on the PROVIDER only, exactly as `MarketsGridHost` keys
              // it. Appending the key column remounted the whole grid the
              // moment `keyColumn` resolved from its 'id' fallback — which is
              // precisely what the surface's late-bound key column exists to
              // avoid (`getRowId` is init-only, so the surface captures a
              // function that reads a ref and rebinds the datasource + ticks
              // in place). T3-14.
              key={`ssrm:${ssrm.provider.id}`}
              gridRef={gridRef}
              gridOptions={shell.gridOptions}
              hostOverrideKeys={shell.hostOverrideKeys}
              theme={shell.theme}
              columnDefs={shell.columnDefs}
              ssrm={ssrm}
              rowHeight={rowHeight}
              headerHeight={headerHeight}
              animateRows={animateRows}
              sideBar={sideBar}
              statusBar={statusBar}
              defaultColDef={shell.effectiveDefaultColDef}
              onGridReady={shell.handleGridReady}
              onGridPreDestroyed={shell.onGridPreDestroyed}
              includeAllStreamSafeFilters={includeAllStreamSafeFilters ?? true}
            />
          ) : (
            <MarketsGridSurface
              gridRef={gridRef}
              gridOptions={shell.gridOptions}
              hostOverrideKeys={shell.hostOverrideKeys}
              theme={shell.theme}
              rowData={rowData ?? []}
              columnDefs={shell.columnDefs}
              rowHeight={rowHeight}
              headerHeight={headerHeight}
              animateRows={animateRows}
              sideBar={sideBar}
              statusBar={statusBar}
              defaultColDef={shell.effectiveDefaultColDef}
              onGridReady={shell.handleGridReady}
              onGridPreDestroyed={shell.onGridPreDestroyed}
              includeAllStreamSafeFilters={includeAllStreamSafeFilters ?? true}
            />
          )}
        </div>
      </GeneralSettingsProvider>
    </GridProvider>
  );
}

export const MarketsGrid = forwardRef(MarketsGridInner) as <TData = unknown>(
  props: MarketsGridProps<TData> & RefAttributes<MarketsGridHandle>,
) => ReactElement;

export const MarketsGridCore = forwardRef(MarketsGridCoreInner) as <TData = unknown>(
  props: MarketsGridProps<TData> & RefAttributes<MarketsGridHandle>,
) => ReactElement;
