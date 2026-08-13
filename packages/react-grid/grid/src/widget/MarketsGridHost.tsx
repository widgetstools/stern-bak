/**
 * MarketsGridHost — the inner shell rendered INSIDE the GridProvider.
 *
 * Split from the outer MarketsGrid because the controller hook
 * (`useMarketsGridController`) calls `useProfileManager`, `useGridApi`,
 * `useGridPlatform`, and `useModuleState` — all of which require the
 * GridProvider context. The outer wrapper sets the provider; this
 * component lives inside it.
 *
 * Pure layout document — every observable behaviour lives in the
 * controller hook or in named view-only sub-components
 * (`./PrimaryToolbar`, `./UnsavedSwitchDialog`, `./MarketsGridSurface`,
 * etc.). No state, no AG-Grid API access, no ProfileManager touching.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { GetContextMenuItemsParams, GridReadyEvent } from 'ag-grid-community';
import { TooltipProvider } from '@wellsfargo-starui/react';
import { resolveGridDensity } from '@wellsfargo-starui/design-system/adapters/ag-grid';
import type { AnyModule, StorageAdapter } from '@wellsfargo-starui/core';
import type { AdminAction, MarketsGridHandle, MarketsGridProps, MarketsGridSsrmProps } from './types';
import { FormattingToolbar } from './FormattingToolbar';
import { EditingToolbar } from './editingToolbar/EditingToolbar';
import type { EditingToolbarHostProps } from './editingToolbar/resolveEditingToolbarAllow';
import { useEffectiveEditingToolbarAllow } from './editingToolbar/useEffectiveEditingToolbarAllow';
import { LazySettingsSheet, preloadSettingsSheet } from './LazySettingsSheet';
import { useMarketsGridController } from './useMarketsGridController';
import { useToolbarDateSettingsBridge } from '../customizer/modules/toolbar-date-settings/useToolbarDateSettingsBridge';
import { PrimaryToolbar } from './PrimaryToolbar';
import { ColumnSelectorDialog } from './column-selector';
import { UnsavedSwitchDialog } from './UnsavedSwitchDialog';
import { MarketsGridSurface } from './MarketsGridSurface';
import { MarketsGridSsrmSurface } from './MarketsGridSsrmSurface';
import { buildGridContextMenuItems } from './gridContextMenu';
import { StaleDataBanner } from './StaleDataBanner';
import { HistoricalViewBanner } from './HistoricalViewBanner';
import { GridChromeProvider } from './GridChromeContext';
import { useGeneralSettingsFromContext } from './GeneralSettingsContext';
import { useProfileSelectorActions } from './useProfileSelectorActions';

export function resolveMarketsGridSurfaceKind(
  props: { ssrm?: MarketsGridSsrmProps; rowData?: unknown },
): 'ssrm' | 'csrm' {
  return props.ssrm?.provider ? 'ssrm' : 'csrm';
}

export interface MarketsGridHostProps<TData> {
  rowData?: TData[];
  ssrm?: MarketsGridSsrmProps;
  columnDefs: unknown[];
  gridOptions: Record<string, unknown>;
  hostOverrideKeys: ReadonlySet<string>;
  handleGridReady: (event: GridReadyEvent) => void;
  onGridPreDestroyed: () => void;
  theme: MarketsGridProps<TData>['theme'];
  gridId: string;
  rowHeight?: number;
  headerHeight?: number;
  animateRows?: boolean;
  sideBar: MarketsGridProps<TData>['sideBar'];
  statusBar: MarketsGridProps<TData>['statusBar'];
  defaultColDef: MarketsGridProps<TData>['defaultColDef'];
  showToolbar: boolean;
  showFiltersToolbar: boolean;
  showFormattingToolbar: boolean;
  editingToolbarHostProps: EditingToolbarHostProps;
  showSaveButton: boolean;
  showSettingsButton: boolean;
  showColumnSelector: boolean;
  showVisualExcelExport: boolean;
  showProfileSelector: boolean;
  modules: AnyModule[];
  className: string | undefined;
  rootStyle: CSSProperties;
  gridRef: RefObject<AgGridReact<TData> | null>;
  storageAdapter: StorageAdapter | undefined;
  autoSaveDebounceMs: number | undefined;
  forwardedRef: ForwardedRef<MarketsGridHandle>;
  onReady: ((handle: MarketsGridHandle) => void) | undefined;
  adminActions: AdminAction[] | undefined;
  gridLevelData: unknown;
  onGridLevelDataLoad: ((data: unknown) => void) | undefined;
  headerExtras: ReactNode;
  componentName: string | undefined;
  instanceId: string | undefined;
  appId: string | undefined;
  userId: string | undefined;
  caption: string | undefined;
  tabsHidden: boolean | undefined;
  onCaptionChange: ((next: string) => void) | undefined;
  onSavingChange: ((saving: boolean) => void) | undefined;
  dataStale: boolean;
  dataStaleMessage: string | undefined;
  historicalViewMode: boolean;
  historicalViewMessage: string | undefined;
  showToolbarDatePicker: boolean;
  toolbarDate: string;
  onToolbarDateChange: (next: string) => void;
  toolbarDateHistoryEnabled: boolean | undefined;
  toolbarActionsLayout: 'inline' | 'overflow';
  includeAllStreamSafeFilters: boolean;
}

function MarketsGridHostInner<TData>({
  rowData,
  ssrm,
  columnDefs,
  gridOptions,
  hostOverrideKeys,
  handleGridReady,
  onGridPreDestroyed,
  theme,
  gridId,
  rowHeight,
  headerHeight,
  animateRows,
  sideBar,
  statusBar,
  defaultColDef,
  showToolbar,
  showFiltersToolbar,
  showFormattingToolbar,
  editingToolbarHostProps,
  showSaveButton,
  showSettingsButton,
  showColumnSelector,
  showVisualExcelExport,
  showProfileSelector,
  modules,
  className,
  rootStyle,
  gridRef,
  storageAdapter,
  autoSaveDebounceMs,
  forwardedRef,
  onReady,
  adminActions,
  gridLevelData,
  onGridLevelDataLoad,
  headerExtras,
  componentName,
  instanceId,
  appId,
  userId,
  caption,
  tabsHidden,
  onCaptionChange,
  onSavingChange,
  dataStale,
  dataStaleMessage,
  historicalViewMode,
  historicalViewMessage,
  showToolbarDatePicker,
  toolbarDate,
  onToolbarDateChange,
  toolbarDateHistoryEnabled,
  toolbarActionsLayout,
  includeAllStreamSafeFilters,
}: MarketsGridHostProps<TData>) {
  const generalSettings = useGeneralSettingsFromContext();
  const headerCaseAttr = generalSettings?.headerCaseUppercase ? 'upper' : undefined;
  const gridDensity = resolveGridDensity(generalSettings);

  const {
    profiles,
    api,
    sheetRef,
    toolbarRef,
    isDirty,
    saveFlash,
    settingsOpen,
    setSettingsOpen,
    settingsFocusRequest,
    styleToolbarOpen,
    pendingSwitch,
    setPendingSwitch,
    handleOpenSettings,
    openColumnSettings,
    columnSelectorOpen,
    setColumnSelectorOpen,
    handleOpenColumnSelector,
    handleToggleStyleToolbar,
    editingToolbarOpen,
    handleToggleEditingToolbar,
    handleExportVisualExcel,
    visualExcelExportEnabled,
    handleSaveAll,
    requestLoadProfile,
    confirmSwitchSave,
    confirmSwitchDiscard,
  } = useMarketsGridController({
    gridId,
    storageAdapter,
    autoSaveDebounceMs,
    forwardedRef,
    onReady,
    gridLevelData,
    onGridLevelDataLoad,
    onSavingChange,
    headerCaseAttr,
  });

  const [settingsMounted, setSettingsMounted] = useState(false);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);
  const handleOpenSettingsTracked = useCallback(() => {
    setSettingsMounted(true);
    handleOpenSettings();
  }, [handleOpenSettings]);

  // Cell right-click menu — prepend "Settings" + "Remove from Grid" to
  // AG-Grid's defaults. "Settings" mounts + opens the customizer on the
  // clicked column; "Remove from Grid" hides it via the native visibility
  // API (re-showable from the side bar's Columns panel). Stable identity
  // (deps are both stable callbacks) so MarketsGridSurface's memo doesn't
  // make AgGridReact re-process the option each render.
  const getContextMenuItems = useCallback(
    (params: GetContextMenuItemsParams) =>
      buildGridContextMenuItems(params, {
        openColumnSettings: (colId) => {
          setSettingsMounted(true);
          openColumnSettings(colId);
        },
      }),
    [openColumnSettings],
  );

  // Warm the settings-sheet chunk while the grid is idle so the first
  // "Grid settings" click doesn't pay the lazy-chunk load. The sheet
  // itself stays unmounted until first open (settingsMounted above), so
  // this is the only place a pre-open preload can actually run.
  useEffect(() => {
    if (!showSettingsButton) return;
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => preloadSettingsSheet());
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(() => preloadSettingsSheet(), 2000);
    return () => clearTimeout(t);
  }, [showSettingsButton]);

  const profileActions = useProfileSelectorActions(profiles, requestLoadProfile);

  const editingToolbarAllow = useEffectiveEditingToolbarAllow(editingToolbarHostProps);

  const toolbarDateBridge = useToolbarDateSettingsBridge({
    toolbarDate,
    onToolbarDateChange,
    toolbarDateHistoryEnabled,
  });

  const chromeState = useMemo(
    () => ({
      settingsOpen,
      setSettingsOpen,
      styleToolbarOpen,
      editingToolbarOpen,
      saveFlash,
      isDirty,
    }),
    [settingsOpen, setSettingsOpen, styleToolbarOpen, editingToolbarOpen, saveFlash, isDirty],
  );

  const kind = resolveMarketsGridSurfaceKind({ ssrm, rowData });

  return (
    <GridChromeProvider value={chromeState}>
    <TooltipProvider delayDuration={200}>
    <div
      className={className}
      style={rootStyle}
      data-grid-id={gridId}
      data-header-case={headerCaseAttr}
      data-stale={dataStale ? 'true' : undefined}
      data-historical-view={historicalViewMode ? 'true' : undefined}
    >
      {historicalViewMode ? (
        <HistoricalViewBanner
          message={
            historicalViewMessage ??
            'Viewing historical data — editing is disabled.'
          }
        />
      ) : null}
      {dataStale ? (
        <StaleDataBanner
          message={
            dataStaleMessage ??
            'Grid data is stale — provider disconnected. Edits are disabled until the connection is restored.'
          }
        />
      ) : null}
      {headerExtras ? (
        <div
          className="ds-toolbar-primary ds-primary-row"
          data-grid-header-extras
        >
          {headerExtras}
        </div>
      ) : null}
      {showToolbar && (
        <PrimaryToolbar
          tabsHidden={tabsHidden}
          caption={caption}
          onCaptionChange={onCaptionChange}
          showFiltersToolbar={showFiltersToolbar}
          showFormattingToolbar={showFormattingToolbar}
          showAutoFormat={showFormattingToolbar}
          styleToolbarOpen={styleToolbarOpen}
          onToggleStyleToolbar={handleToggleStyleToolbar}
          showEditingToolbar={editingToolbarAllow.rowVisible}
          editingToolbarOpen={editingToolbarOpen}
          onToggleEditingToolbar={handleToggleEditingToolbar}
          showColumnSelector={showColumnSelector}
          onOpenColumnSelector={handleOpenColumnSelector}
          showProfileSelector={showProfileSelector}
          profileList={profiles.profiles}
          activeProfileId={profiles.activeProfileId ?? ''}
          profileActions={profileActions}
          isDirty={isDirty}
          showSaveButton={showSaveButton}
          saveFlash={saveFlash}
          onSaveAll={handleSaveAll}
          showSettingsButton={showSettingsButton}
          onOpenSettings={handleOpenSettingsTracked}
          showVisualExcelExport={showVisualExcelExport}
          visualExcelExportEnabled={visualExcelExportEnabled}
          onExportVisualExcel={handleExportVisualExcel}
          adminActions={adminActions}
          componentName={componentName}
          gridId={gridId}
          instanceId={instanceId}
          appId={appId}
          userId={userId}
          showToolbarDatePicker={showToolbarDatePicker}
          toolbarDate={toolbarDateBridge.toolbarDate}
          onToolbarDateChange={toolbarDateBridge.onToolbarDateChange}
          toolbarDateHistoryEnabled={toolbarDateBridge.toolbarDateHistoryEnabled}
          toolbarActionsLayout={toolbarActionsLayout}
          gridDensity={gridDensity}
        />
      )}

      {editingToolbarOpen && editingToolbarAllow.rowVisible && (
        <EditingToolbar allow={editingToolbarAllow} />
      )}

      {showFormattingToolbar && styleToolbarOpen && (
        <div
          className="ds-tb-pinned"
          data-testid="formatting-toolbar-pinned"
          style={{ flexShrink: 0 }}
        >
          {/* Toolbar only renders while open, so toggle == close. */}
          <FormattingToolbar ref={toolbarRef} onClose={handleToggleStyleToolbar} />
        </div>
      )}

      {kind === 'ssrm' && ssrm ? (
        <MarketsGridSsrmSurface
          key={`ssrm:${ssrm.provider.id}:${ssrm.keyColumn ?? 'id'}`}
          gridRef={gridRef}
          gridOptions={gridOptions}
          hostOverrideKeys={hostOverrideKeys}
          theme={theme}
          columnDefs={columnDefs}
          ssrm={ssrm}
          rowHeight={rowHeight}
          headerHeight={headerHeight}
          animateRows={animateRows}
          sideBar={sideBar}
          statusBar={statusBar}
          defaultColDef={defaultColDef}
          getContextMenuItems={getContextMenuItems}
          onGridReady={handleGridReady}
          onGridPreDestroyed={onGridPreDestroyed}
          includeAllStreamSafeFilters={includeAllStreamSafeFilters}
        />
      ) : (
        <MarketsGridSurface
          key="csrm"
          gridRef={gridRef}
          gridOptions={gridOptions}
          hostOverrideKeys={hostOverrideKeys}
          theme={theme}
          rowData={rowData ?? []}
          columnDefs={columnDefs}
          rowHeight={rowHeight}
          headerHeight={headerHeight}
          animateRows={animateRows}
          sideBar={sideBar}
          statusBar={statusBar}
          defaultColDef={defaultColDef}
          getContextMenuItems={getContextMenuItems}
          onGridReady={handleGridReady}
          onGridPreDestroyed={onGridPreDestroyed}
          includeAllStreamSafeFilters={includeAllStreamSafeFilters}
        />
      )}

      {(settingsMounted || settingsOpen) && (
        <LazySettingsSheet
          ref={sheetRef}
          modules={modules}
          open={settingsOpen}
          onClose={handleCloseSettings}
          initialModuleId="general-settings"
          focusRequest={settingsFocusRequest ?? undefined}
        />
      )}

      <UnsavedSwitchDialog
        open={pendingSwitch !== null}
        onCancel={() => setPendingSwitch(null)}
        onDiscard={confirmSwitchDiscard}
        onSave={confirmSwitchSave}
      />

      {showColumnSelector && (
        <ColumnSelectorDialog
          open={columnSelectorOpen}
          onOpenChange={setColumnSelectorOpen}
          api={api}
        />
      )}
    </div>
    </TooltipProvider>
    </GridChromeProvider>
  );
}

export const MarketsGridHost = memo(MarketsGridHostInner) as typeof MarketsGridHostInner;
