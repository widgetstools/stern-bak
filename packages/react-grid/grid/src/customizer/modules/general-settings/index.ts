/**
 * Grid Options — the "vitals" module. Carries the Top-40 curated AG-Grid
 * options (see `/ag-grid-customizer-input-controls.md`).
 *
 * Priority `0` — runs FIRST in the transform pipeline so every other
 * module sees a canonical `defaultColDef` + row sizing + selection
 * config shaped by the user's preferences.
 *
 * `schemaVersion: 3` — a schemaVersion 1 or 2 snapshot (smaller field
 * set) migrates by additively filling every new field from
 * `INITIAL_GENERAL_SETTINGS`. The bump is intra-module — the app
 * version was never tied to module schema versions. v3 adds Side Bar
 * + Status Bar visibility toggles + their per-panel sub-toggles.
 * v4 adds `cellChangeFlashColor` (AG-Grid native flash tint swatches).
 * v5 adds `gridDensity` (ultra / compact / comfortable Quartz preset).
 * v6 adds `maxGridUpdatesPerSecond` (grid refresh-rate cap →
 * `asyncTransactionWaitMillis`; default 5/sec).
 */
import type { GridOptions } from 'ag-grid-community';
import type { Module, TransformContext } from '@wellsfargo-starui/engine';
import { INITIAL_GENERAL_SETTINGS, type GeneralSettingsState } from './state';
import { GridOptionsPanel } from './GridOptionsPanel';
import {
  buildCellChangeFlashCss,
  CELL_CHANGE_FLASH_CSS_HANDLE,
  CELL_CHANGE_FLASH_CSS_RULE_ID,
} from './cellChangeFlashCss';

export const GENERAL_SETTINGS_MODULE_ID = 'general-settings';

/**
 * Module-level constant so `defaultColDef` carries the SAME function
 * reference across transform passes. An inline closure here minted a
 * fresh function per pass, which made every defaultColDef object
 * incomparable in useGridHost's post-mount sync — one setGridOption
 * ('defaultColDef') push (and the column-def re-evaluation it
 * triggers) per store tick, even with zero settings changes.
 * Returning `null` for empty cells suppresses the tooltip (AG-Grid
 * also skips `undefined`/`null`/'' on its own).
 */
const RAW_VALUE_TOOLTIP_GETTER = (params: { value: unknown }): string | null => {
  const { value } = params;
  if (value == null) return null;
  const str = String(value);
  return str === '' ? null : str;
};

/** Materialise persisted row-selection mode into AG Grid 35 `RowSelectionOptions`. */
function buildRowSelectionOptions(
  mode: NonNullable<GeneralSettingsState['rowSelection']>,
  checkboxSelection: boolean,
): NonNullable<GridOptions['rowSelection']> {
  if (checkboxSelection) {
    // multiRow: header "select all" follows row checkboxes; singleRow has no header checkbox.
    return mode === 'multiRow'
      ? { mode, checkboxes: true, headerCheckbox: true }
      : { mode, checkboxes: true };
  }
  // Checkbox-less selection: hide row + header checkboxes; click rows to select.
  // AG Grid only removes the selection column when BOTH checkboxes and headerCheckbox are false.
  return {
    mode,
    checkboxes: false,
    headerCheckbox: false,
    enableClickSelection: true,
  };
}

export const generalSettingsModule: Module<GeneralSettingsState> = {
  id: GENERAL_SETTINGS_MODULE_ID,
  name: 'Grid Options',
  code: '00',
  schemaVersion: 6,
  priority: 0,

  getInitialState: () => ({ ...INITIAL_GENERAL_SETTINGS }),

  serialize: (state) => state,
  deserialize: (raw) => ({
    ...INITIAL_GENERAL_SETTINGS,
    ...((raw as Partial<GeneralSettingsState> | null) ?? {}),
  }),
  // Additive migration: always fill current defaults, overlay stored
  // values. New fields drop in transparently across version bumps.
  migrate: (raw) =>
    !raw || typeof raw !== 'object'
      ? { ...INITIAL_GENERAL_SETTINGS }
      : { ...INITIAL_GENERAL_SETTINGS, ...(raw as Partial<GeneralSettingsState>) },

  transformGridOptions(opts: Partial<GridOptions>, s: GeneralSettingsState, ctx: TransformContext): Partial<GridOptions> {
    const flashCss = ctx.resources.css(CELL_CHANGE_FLASH_CSS_HANDLE);
    if (s.enableCellChangeFlash) {
      flashCss.addRule(
        CELL_CHANGE_FLASH_CSS_RULE_ID,
        buildCellChangeFlashCss(ctx.gridId, s.cellChangeFlashColor),
      );
    } else {
      flashCss.removeRule(CELL_CHANGE_FLASH_CSS_RULE_ID);
    }

    // Compound multi-sort → three AG-Grid flags.
    const multi = {
      replace: { suppressMultiSort: true, alwaysMultiSort: false, multiSortKey: undefined as 'ctrl' | undefined },
      shift:   { suppressMultiSort: false, alwaysMultiSort: false, multiSortKey: undefined as 'ctrl' | undefined },
      ctrl:    { suppressMultiSort: false, alwaysMultiSort: false, multiSortKey: 'ctrl' as const },
      always:  { suppressMultiSort: false, alwaysMultiSort: true,  multiSortKey: undefined as 'ctrl' | undefined },
    }[s.multiSortMode];

    // Compound enter-navigation → two AG-Grid flags.
    const enterNav = {
      default:   { enterNavigatesVertically: false, enterNavigatesVerticallyAfterEdit: false },
      always:    { enterNavigatesVertically: true,  enterNavigatesVerticallyAfterEdit: false },
      afterEdit: { enterNavigatesVertically: false, enterNavigatesVerticallyAfterEdit: true  },
      both:      { enterNavigatesVertically: true,  enterNavigatesVerticallyAfterEdit: true  },
    }[s.enterNavigation];

    // Side Bar — when off, pass `false` (AG-Grid hides the panel and
    // its anchor button entirely). When on, build a tool-panels array
    // by filtering the show-flags, mirroring AG-Grid's stock
    // `agColumnsToolPanel` / `agFiltersToolPanel` definitions.
    const sideBarPanels: Array<Record<string, unknown>> = [];
    if (s.sideBar) {
      if (s.sideBarShowColumns) {
        sideBarPanels.push({
          id: 'columns',
          labelDefault: 'Columns',
          labelKey: 'columns',
          iconKey: 'columns',
          toolPanel: 'agColumnsToolPanel',
        });
      }
      if (s.sideBarShowFilters) {
        sideBarPanels.push({
          id: 'filters',
          labelDefault: 'Filters',
          labelKey: 'filters',
          iconKey: 'filter',
          toolPanel: 'agFiltersToolPanel',
        });
      }
    }
    // Default panel is only honoured if it references an actually-enabled
    // panel — otherwise AG-Grid logs a warning and leaves it closed.
    const defaultPanelEnabled =
      (s.sideBarDefaultPanel === 'columns' && s.sideBarShowColumns) ||
      (s.sideBarDefaultPanel === 'filters' && s.sideBarShowFilters);
    const sideBarOpt = !s.sideBar || sideBarPanels.length === 0
      ? false
      : {
          toolPanels: sideBarPanels,
          defaultToolPanel: defaultPanelEnabled ? s.sideBarDefaultPanel : undefined,
        };

    // Status Bar — same pattern. AG-Grid's `statusBar` is undefined when
    // off (it has no `false` shorthand like `sideBar` does), so we omit
    // the property entirely rather than assign undefined to satisfy the
    // type checker.
    const statusBarPanels: Array<Record<string, unknown>> = [];
    if (s.statusBar) {
      if (s.statusBarShowTotalAndFilteredCount) {
        statusBarPanels.push({ statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' });
      }
      if (s.statusBarShowFilteredCount) {
        statusBarPanels.push({ statusPanel: 'agFilteredRowCountComponent' });
      }
      if (s.statusBarShowTotalCount) {
        statusBarPanels.push({ statusPanel: 'agTotalRowCountComponent' });
      }
      if (s.statusBarShowSelectedCount) {
        statusBarPanels.push({ statusPanel: 'agSelectedRowCountComponent' });
      }
      if (s.statusBarShowAggregation) {
        statusBarPanels.push({ statusPanel: 'agAggregationComponent', align: 'right' });
      }
    }
    const statusBarOpt = s.statusBar && statusBarPanels.length > 0
      ? { statusPanels: statusBarPanels }
      : undefined;

    return {
      ...opts,

      // ── Tier 1 ──
      rowHeight: s.rowHeight,
      headerHeight: s.headerHeight,
      pagination: s.pagination,
      paginationPageSize: s.pagination ? s.paginationPageSize : undefined,
      paginationAutoPageSize: s.pagination ? s.paginationAutoPageSize : undefined,
      suppressPaginationPanel: s.pagination ? s.suppressPaginationPanel : undefined,
      rowSelection: s.rowSelection
        ? buildRowSelectionOptions(s.rowSelection, s.checkboxSelection)
        : undefined,
      // Re-emit AG-Grid's default selection column pinned to the left.
      // `pinned: 'left'` (NOT `initialPinned`) re-applies on every
      // `setColumnDefs`, otherwise the selection column silently drifts
      // rightward by one slot each time a formatting change triggers a
      // columnDefs re-derive (user sees the checkbox column jump from
      // position 0 to position 1 after the first style is applied).
      // `initialPinned` is a mount-only hint AG-Grid drops on subsequent
      // setColumnDefs calls; `pinned` is the load-bearing equivalent.
      // `suppressMovable: false, lockPosition: false` still lets the
      // user drag within the left-pinned area.
      selectionColumnDef: s.rowSelection && s.checkboxSelection
        ? { suppressMovable: false, lockPosition: false, pinned: 'left' }
        : undefined,
      cellSelection: s.cellSelection,
      rowDragManaged: s.rowDragging,
      animateRows: s.animateRows,
      cellFlashDuration: s.cellFlashDuration,
      cellFadeDuration: s.cellFadeDuration,
      quickFilterText: s.quickFilterText || undefined,

      // ── Tier 2 — grouping / pivoting ──
      groupDisplayType: s.groupDisplayType,
      groupDefaultExpanded: s.groupDefaultExpanded,
      rowGroupPanelShow: s.rowGroupPanelShow,
      pivotMode: s.pivotMode,
      pivotPanelShow: s.pivotPanelShow,
      grandTotalRow: s.grandTotalRow,
      groupTotalRow: s.groupTotalRow,
      groupHideOpenParents: s.groupHideOpenParents,
      suppressAggFuncInHeader: s.suppressAggFuncInHeader,
      showOpenedGroup: s.showOpenedGroup,
      // groupHideColumnsUntilExpanded is intentionally NOT emitted —
      // AG-Grid 35.1.0 doesn't recognise it (logs an "invalid
      // gridOptions property" warning) and there's no like-for-like
      // replacement. The state is still tracked + shown in the
      // settings panel so the toggle is preserved if AG-Grid adds
      // it back in a later minor.
      groupHideParentOfSingleChild: s.groupHideParentOfSingleChild,
      groupAllowUnbalanced: s.groupAllowUnbalanced,
      groupMaintainOrder: s.groupMaintainOrder,
      suppressGroupRowsSticky: s.suppressGroupRowsSticky,
      rowGroupPanelSuppressSort: s.rowGroupPanelSuppressSort,
      groupLockGroupColumns: s.groupLockGroupColumns,
      suppressGroupChangesColumnVisibility: s.suppressGroupChangesColumnVisibility,
      ssrmExpandAllAffectsAllRows: s.ssrmExpandAllAffectsAllRows,
      refreshAfterGroupEdit: s.refreshAfterGroupEdit,

      // ── Tier 3 — filtering / sorting / clipboard ──
      enableAdvancedFilter: s.enableAdvancedFilter,
      includeHiddenColumnsInQuickFilter: s.includeHiddenColumnsInQuickFilter,
      ...multi,
      accentedSort: s.accentedSort,
      copyHeadersToClipboard: s.copyHeadersToClipboard,
      clipboardDelimiter: s.clipboardDelimiter,

      // ── Tier 4 — editing ──
      singleClickEdit: s.singleClickEdit,
      stopEditingWhenCellsLoseFocus: s.stopEditingWhenCellsLoseFocus,
      ...enterNav,
      undoRedoCellEditing: s.undoRedoCellEditing,
      undoRedoCellEditingLimit: s.undoRedoCellEditing ? s.undoRedoCellEditingLimit : undefined,
      tooltipShowDelay: s.tooltipShowDelay,
      tooltipShowMode: s.tooltipShowMode,

      // ── Tier 5 — styling ──
      suppressRowHoverHighlight: s.suppressRowHoverHighlight,
      columnHoverHighlight: s.columnHoverHighlight,

      // ── Shared flags ──
      enableCellTextSelection: s.enableCellTextSelection,
      suppressDragLeaveHidesColumns: s.suppressDragLeaveHidesColumns,
      suppressColumnMoveAnimation: s.suppressColumnMoveAnimation,
      allowDragFromColumnsToolPanel: s.allowDragFromColumnsToolPanel,

      // ── Default ColDef — host `opts.defaultColDef` wins on conflict ──
      defaultColDef: {
        resizable: s.defaultResizable,
        minWidth: s.defaultMinWidth,
        maxWidth: s.defaultMaxWidth,
        width: s.defaultWidth,
        flex: s.defaultFlex,
        suppressSizeToFit: s.suppressSizeToFit,
        suppressAutoSize: s.suppressAutoSize,
        sortable: s.defaultSortable,
        filter: s.defaultFilterable,
        unSortIcon: s.unSortIcon,
        floatingFilter: s.floatingFilter,
        editable: s.defaultEditable,
        suppressPaste: s.suppressPaste,
        suppressNavigable: s.suppressNavigable,
        wrapHeaderText: s.wrapHeaderText,
        autoHeaderHeight: s.autoHeaderHeight,
        suppressHeaderMenuButton: s.suppressHeaderMenuButton,
        suppressMovable: s.suppressMovable,
        lockPosition: s.lockPosition,
        lockVisible: s.lockVisible,
        lockPinned: s.lockPinned,
        wrapText: s.wrapText,
        autoHeight: s.autoHeight,
        enableCellChangeFlash: s.enableCellChangeFlash,
        enableRowGroup: s.enableRowGroup,
        enablePivot: s.enablePivot,
        enableValue: s.enableValue,
        // AG-Grid ColDef `defaultAggFunc` — the agg function pre-selected
        // when a column is dragged into the values panel (or aggregated via
        // the tool panel). NOT `aggFunc`, which would force EVERY column to
        // aggregate. AG-Grid's own default for this is 'sum'.
        defaultAggFunc: s.defaultAggFunc,
        // Cell tooltip — show every cell's RAW underlying value on hover
        // (the unformatted datum, not `params.valueFormatted`), so the full
        // content is visible regardless of any currency/date `valueFormatter`.
        // Pairs with `tooltipShowMode: 'whenTruncated'` so the tooltip only
        // appears when the rendered text is clipped.
        tooltipValueGetter: s.showCellTooltips ? RAW_VALUE_TOOLTIP_GETTER : undefined,
        ...opts.defaultColDef,
      },

      // ── Side Bar / Status Bar ──
      // sideBar: `false` when off (matches AG-Grid's "no sidebar" shape);
      // a SideBarDef with toolPanels[] when on. The host's `opts.sideBar`
      // is intentionally OVERRIDDEN — this is a user-controlled option,
      // and the host typically passes nothing here anyway.
      sideBar: sideBarOpt,
      // statusBar is omitted (left as host's `opts.statusBar`) when off,
      // so a host that wires its own status bar isn't clobbered. When the
      // user enables it, our config wins.
      ...(statusBarOpt ? { statusBar: statusBarOpt } : {}),

      // ── Performance ──
      // Grid refresh-rate cap: 8/sec → 125 ms async-transaction flush
      // window. Streaming ticks accumulate between flushes and land
      // with final values (flash fires once per flush). 0 = uncapped —
      // flush ASAP, the pre-v6 surface behaviour.
      asyncTransactionWaitMillis:
        s.maxGridUpdatesPerSecond > 0
          ? Math.round(1000 / s.maxGridUpdatesPerSecond)
          : 0,
      rowBuffer: s.rowBuffer,
      suppressScrollOnNewData: s.suppressScrollOnNewData,
      suppressColumnVirtualisation: s.suppressColumnVirtualisation,
      suppressMaxRenderedRowRestriction: s.suppressMaxRenderedRowRestriction,
      suppressAnimationFrame: s.suppressAnimationFrame,
      debounceVerticalScrollbar: s.debounceVerticalScrollbar,
    // Double-cast: some grid-option fields (e.g. groupHideColumnsUntilExpanded)
    // exist in newer AG-Grid minor releases but aren't in 35.1.0's type defs.
    // Pinning to 35.1.0 exact (corporate requirement) means TS flags them as
    // excess-properties; we pass them through at runtime since AG-Grid silently
    // ignores unknown options.
    } as unknown as Partial<GridOptions>;
  },

  // No transformColumnDefs: `enableCellChangeFlash` rides
  // `defaultColDef` (transformGridOptions above), which AG-Grid merges
  // into every column. The old per-colDef spread cloned EVERY colDef on
  // EVERY transform pass — since this module runs first (priority 0),
  // that broke colDef identity for the whole pipeline on each pass and
  // re-triggered AG-Grid column-state reconciliation downstream. It
  // also clobbered any host-set per-column flash override, which the
  // defaultColDef route correctly leaves in charge.

  SettingsPanel: GridOptionsPanel,
};

export type { GeneralSettingsState };
export { INITIAL_GENERAL_SETTINGS };
