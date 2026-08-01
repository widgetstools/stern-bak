import type { FlashColor } from '../conditional-styling/state.js';

/**
 * Grid Options state — the single source of truth for AG-Grid configuration
 * the user can tweak from the Grid Options panel.
 *
 * Mirrors the curated "Top 40" set from
 * `ag-grid-customizer-input-controls.md`, organised by tier so the panel
 * can lay them out 1:1 without ad-hoc regrouping. `schemaVersion` bumped
 * to 2 — older snapshots get every new field filled from
 * `INITIAL_GENERAL_SETTINGS` by the module's `migrate()`.
 */
/** Matches `@wellsfargo-starui/design-system/adapters/ag-grid` `GridDensity`. */
export type GridDensity = 'ultra' | 'compact' | 'comfort';

export interface GeneralSettingsState {
  // ─── Tier 1 — Essential ──────────────────────────────────────────────────
  /** Quartz compactness preset — drives `spacing`, row/header heights, and font sizes. */
  gridDensity: GridDensity;
  rowHeight: number;
  headerHeight: number;
  pagination: boolean;
  paginationPageSize: number;
  paginationAutoPageSize: boolean;
  suppressPaginationPanel: boolean;
  /** AG-Grid v35 prefers the object form; we keep `undefined | 'singleRow' | 'multiRow'`
   *  on disk and materialise the object at transform time. */
  rowSelection: 'singleRow' | 'multiRow' | undefined;
  checkboxSelection: boolean;
  /** Enterprise · boolean shortcut for the AG-Grid cell-range selection. */
  cellSelection: boolean;
  rowDragging: boolean;
  animateRows: boolean;
  cellFlashDuration: number;
  cellFadeDuration: number;
  /** Background tint for AG-Grid native `ag-cell-data-changed` flash.
   *  Only applied when {@link enableCellChangeFlash} is true. */
  cellChangeFlashColor: FlashColor;
  quickFilterText: string;

  // ─── Tier 2 — Grouping, Pivoting, Aggregation ────────────────────────────
  groupDisplayType: 'singleColumn' | 'multipleColumns' | 'groupRows' | 'custom' | undefined;
  /** `0` = none · `-1` = expand all · positive integer = level count. */
  groupDefaultExpanded: number;
  rowGroupPanelShow: 'always' | 'onlyWhenGrouping' | 'never';
  pivotMode: boolean;
  pivotPanelShow: 'always' | 'onlyWhenPivoting' | 'never';
  grandTotalRow: 'top' | 'bottom' | 'pinnedTop' | 'pinnedBottom' | undefined;
  groupTotalRow: 'top' | 'bottom' | undefined;
  groupHideOpenParents: boolean;
  suppressAggFuncInHeader: boolean;

  // ─── Row grouping — extended options (per AG-Grid v35 reference) ─────────
  /** Show the open group in the group column for non-group rows. */
  showOpenedGroup: boolean;
  /** Hide group columns for levels that have not yet been expanded (CSRM only).
   *  Only meaningful with `groupDisplayType='multipleColumns'` or
   *  `groupHideOpenParents=true`. */
  groupHideColumnsUntilExpanded: boolean;
  /** Display the child row in place of the group row when the group has a
   *  single child. `'leafGroupsOnly'` restricts the behaviour to leaf groups. */
  groupHideParentOfSingleChild: boolean | 'leafGroupsOnly';
  /** Don't create a "(Blanks)" group for nodes missing a grouping value —
   *  display them alongside regular group nodes instead. */
  groupAllowUnbalanced: boolean;
  /** Preserve the current group order when sorting on non-group columns. */
  groupMaintainOrder: boolean;
  /** Prevent group rows from sticking to the top of the viewport (Initial). */
  suppressGroupRowsSticky: boolean;
  /** Suppress sort indicators + actions on the row-group-panel chips. */
  rowGroupPanelSuppressSort: boolean;
  /** Lock the first N group columns. `-1` locks all group columns. */
  groupLockGroupColumns: number;
  /** Prevent column visibility changes when grouped columns are changed.
   *  Enum form lets you suppress only the hide-on-group OR show-on-ungroup
   *  half of the default behaviour. */
  suppressGroupChangesColumnVisibility: boolean | 'suppressHideOnGroup' | 'suppressShowOnUngroup';
  /** SSRM only — expandAll / collapseAll apply to all rows (not just loaded
   *  ones), and group interactions override the `isServerSideGroupOpenByDefault`
   *  default. Must also supply `getRowId` when enabled. */
  ssrmExpandAllAffectsAllRows: boolean;
  /** Re-evaluate the grouping hierarchy after editing a grouped column value —
   *  moves the row to the correct group immediately. */
  refreshAfterGroupEdit: boolean;

  // ─── Tier 3 — Filtering, Sorting, Clipboard ──────────────────────────────
  enableAdvancedFilter: boolean;
  includeHiddenColumnsInQuickFilter: boolean;
  /**
   * Compound multi-sort mode — spec calls for three underlying flags, but
   * the panel presents them as a single radio group. Mapping:
   *   - `'replace'`  → suppressMultiSort=true,  alwaysMultiSort=false, multiSortKey=undefined
   *   - `'shift'`    → suppressMultiSort=false, alwaysMultiSort=false, multiSortKey=undefined  (default)
   *   - `'ctrl'`     → suppressMultiSort=false, alwaysMultiSort=false, multiSortKey='ctrl'
   *   - `'always'`   → suppressMultiSort=false, alwaysMultiSort=true,  multiSortKey=undefined
   */
  multiSortMode: 'replace' | 'shift' | 'ctrl' | 'always';
  accentedSort: boolean;
  copyHeadersToClipboard: boolean;
  clipboardDelimiter: string;

  // ─── Tier 4 — Editing & Interaction ──────────────────────────────────────
  singleClickEdit: boolean;
  stopEditingWhenCellsLoseFocus: boolean;
  /** Combined radio group — maps to two AG-Grid flags at transform time.
   *   - `'default'` → both false
   *   - `'always'`  → enterNavigatesVertically=true, enterNavigatesVerticallyAfterEdit=false
   *   - `'afterEdit'` → enterNavigatesVertically=false, enterNavigatesVerticallyAfterEdit=true
   *   - `'both'`    → both true */
  enterNavigation: 'default' | 'always' | 'afterEdit' | 'both';
  undoRedoCellEditing: boolean;
  undoRedoCellEditingLimit: number;
  tooltipShowDelay: number;
  tooltipShowMode: 'standard' | 'whenTruncated';

  // ─── Tier 5 — Styling ────────────────────────────────────────────────────
  suppressRowHoverHighlight: boolean;
  columnHoverHighlight: boolean;
  /** Render all AG Grid column header captions in uppercase. The authored
   *  `headerName` values remain unchanged so switching this off restores the
   *  original camelCase / Title Case captions. */
  headerCaseUppercase: boolean;
  /** Show every cell's RAW underlying value as a hover tooltip. Wired to
   *  AG-Grid via `defaultColDef.tooltipValueGetter` so clipped cell content
   *  stays readable on hover without per-column configuration. On by default
   *  and paired with `tooltipShowMode: 'whenTruncated'` so the tooltip only
   *  surfaces when the text is actually truncated; also flipped via the
   *  formatter toolbar's "tooltip" pill. */
  showCellTooltips: boolean;

  // ─── Default ColDef ──────────────────────────────────────────────────────
  //
  // User-configurable subset of AG-Grid's ColDef applied to every column
  // via `GridOptions.defaultColDef`. Individual ColDef entries still win
  // on conflict (AG-Grid merges `columnDefs[i]` over `defaultColDef`).
  // Refer to AG-Grid v35 Column Properties for the full surface; this
  // list covers the user-actionable toggles and scalars.

  // Sizing
  defaultResizable: boolean;
  /** Minimum pixel width for every column. */
  defaultMinWidth: number;
  /** Maximum pixel width. `undefined` = no cap. */
  defaultMaxWidth: number | undefined;
  /** Explicit pixel width — `undefined` leaves columns at AG-Grid's
   *  auto-sized default (the larger of the column's own `width` setting
   *  and `defaultMinWidth`). */
  defaultWidth: number | undefined;
  /** Flex factor. When set, the column takes a share of remaining space
   *  proportional to this number. Use with other columns' flex values. */
  defaultFlex: number | undefined;
  /** Prevent `api.sizeColumnsToFit()` from considering this column. */
  suppressSizeToFit: boolean;
  /** Disable header double-click to auto-size. */
  suppressAutoSize: boolean;

  // Sorting & filtering
  defaultSortable: boolean;
  defaultFilterable: boolean;
  /** Show the un-sorted icon even when the column isn't sorted. */
  unSortIcon: boolean;
  /** Render a floating filter row under each column header. */
  floatingFilter: boolean;

  // Editing
  defaultEditable: boolean;
  /** Block paste into cells. */
  suppressPaste: boolean;
  /** Skip this column in keyboard navigation. */
  suppressNavigable: boolean;

  // Header
  wrapHeaderText: boolean;
  /** Grow the header row to show the full wrapped text. */
  autoHeaderHeight: boolean;
  /** Hide the hamburger menu button on every column header. */
  suppressHeaderMenuButton: boolean;

  // Movement & locking
  suppressMovable: boolean;
  /** Lock every column's position — `false` (default), `true`/`'left'`,
   *  or `'right'`. */
  lockPosition: boolean | 'left' | 'right';
  /** Block hide/show via the UI. */
  lockVisible: boolean;
  /** Block pin/unpin via the UI. */
  lockPinned: boolean;

  // Cell content
  /** Wrap long cell text into multiple lines. */
  wrapText: boolean;
  /** Auto-size row height to fit the wrapped content. */
  autoHeight: boolean;
  /** Flash the cell background on value change (ticker UX). */
  enableCellChangeFlash: boolean;

  // Row grouping / pivoting (Enterprise — inert in community build)
  /** Allow dragging this column into the row-group panel. */
  enableRowGroup: boolean;
  /** Allow dragging this column into the pivot panel. */
  enablePivot: boolean;
  /** Allow dragging this column into the values / aggregations panel. */
  enableValue: boolean;
  /** AG-Grid `defaultColDef.defaultAggFunc` — the aggregation function
   *  pre-selected when a column is dragged into the values panel (or
   *  aggregated from the tool panel). One of the built-ins `'sum'`, `'avg'`,
   *  `'min'`, `'max'`, `'count'`, `'first'`, `'last'`. Unlike `aggFunc`, this
   *  does NOT force columns to aggregate — it only changes the default pick
   *  (AG-Grid's own default is `'sum'`). `undefined` falls back to AG-Grid's. */
  defaultAggFunc: string | undefined;

  // Legacy / shared flags (kept on the state so existing profiles
  // migrate additively)
  enableCellTextSelection: boolean;
  suppressDragLeaveHidesColumns: boolean;
  suppressColumnMoveAnimation: boolean;
  /** Allow dragging columns from the Columns tool panel onto the grid to
   *  show / reorder / pin them (AG Grid `allowDragFromColumnsToolPanel`). */
  allowDragFromColumnsToolPanel: boolean;

  // ─── Side Bar ────────────────────────────────────────────────────────────
  // AG-Grid's tool-panel sidebar. The master switch flips the whole panel
  // on/off; individual `sideBarShow*` toggles control which tool panels
  // appear inside it.
  sideBar: boolean;
  sideBarShowColumns: boolean;
  sideBarShowFilters: boolean;
  /** Which panel opens by default when the side bar is shown. `undefined`
   *  leaves it closed; values must reference an enabled tool panel. */
  sideBarDefaultPanel: 'columns' | 'filters' | undefined;

  // ─── Status Bar ──────────────────────────────────────────────────────────
  // AG-Grid's status bar at the bottom of the grid. Master switch flips
  // the whole bar on/off; individual `statusBarShow*` toggles control
  // which status panels appear inside it.
  statusBar: boolean;
  /** "X of Y rows" — the most common single-panel choice. */
  statusBarShowTotalAndFilteredCount: boolean;
  statusBarShowFilteredCount: boolean;
  statusBarShowTotalCount: boolean;
  statusBarShowSelectedCount: boolean;
  /** Sum / Avg / Min / Max of the current cell-range selection. */
  statusBarShowAggregation: boolean;

  // ─── Performance overrides (advanced / collapsed) ────────────────────────
  /**
   * Cap on grid refresh flushes per second — maps to AG-Grid
   * `asyncTransactionWaitMillis` (`8` → 125 ms batching window).
   * Ticks accumulate between flushes and land with FINAL values, so
   * cell-change flash fires once per flush instead of strobing.
   * `0` = uncapped (flush ASAP after each transaction). Live-editable.
   * The load-bearing knob for many blotters on one machine: 10 windows
   * × 8 flushes/s is bounded grid work regardless of feed rate.
   */
  maxGridUpdatesPerSecond: number;
  /** Live-editable. */
  rowBuffer: number;
  /** Live-editable. */
  suppressScrollOnNewData: boolean;
  /** Initial-only in AG-Grid — takes effect on next grid mount. */
  suppressColumnVirtualisation: boolean;
  /** Initial-only. */
  suppressRowVirtualisation: boolean;
  /** Initial-only. */
  suppressMaxRenderedRowRestriction: boolean;
  /** Initial-only. */
  suppressAnimationFrame: boolean;
  /** Initial-only. */
  debounceVerticalScrollbar: boolean;
}

export const INITIAL_GENERAL_SETTINGS: GeneralSettingsState = {
  // Tier 1
  // Defaults aligned with `@wellsfargo-starui/design-system/adapters/ag-grid`
  // compact density (rowHeight 30, headerHeight 32) so a fresh profile
  // matches the theme. Users can still override either via Settings.
  gridDensity: 'compact',
  rowHeight: 30,
  headerHeight: 32,
  pagination: false,
  paginationPageSize: 100,
  paginationAutoPageSize: false,
  suppressPaginationPanel: false,
  rowSelection: 'multiRow',
  checkboxSelection: true,
  cellSelection: true,
  rowDragging: false,
  animateRows: false,
  cellFlashDuration: 500,
  cellFadeDuration: 1000,
  cellChangeFlashColor: 'emerald',
  quickFilterText: '',

  // Tier 2
  groupDisplayType: 'singleColumn',
  groupDefaultExpanded: 0,
  rowGroupPanelShow: 'always',
  pivotMode: false,
  pivotPanelShow: 'always',
  grandTotalRow: 'pinnedBottom',
  groupTotalRow: 'bottom',
  groupHideOpenParents: false,
  suppressAggFuncInHeader: true,
  // Row grouping — extended options
  showOpenedGroup: false,
  groupHideColumnsUntilExpanded: false,
  groupHideParentOfSingleChild: false,
  groupAllowUnbalanced: false,
  groupMaintainOrder: false,
  suppressGroupRowsSticky: false,
  rowGroupPanelSuppressSort: false,
  groupLockGroupColumns: 0,
  suppressGroupChangesColumnVisibility: false,
  ssrmExpandAllAffectsAllRows: false,
  refreshAfterGroupEdit: false,

  // Tier 3
  enableAdvancedFilter: false,
  includeHiddenColumnsInQuickFilter: false,
  multiSortMode: 'shift',
  accentedSort: false,
  copyHeadersToClipboard: false,
  clipboardDelimiter: '\t',

  // Tier 4
  singleClickEdit: false,
  stopEditingWhenCellsLoseFocus: false,
  enterNavigation: 'default',
  undoRedoCellEditing: false,
  undoRedoCellEditingLimit: 10,
  tooltipShowDelay: 2000,
  tooltipShowMode: 'whenTruncated',

  // Tier 5
  suppressRowHoverHighlight: false,
  columnHoverHighlight: false,
  headerCaseUppercase: false,
  showCellTooltips: false,

  // Default ColDef — sizing
  defaultResizable: true,
  defaultMinWidth: 80,
  defaultMaxWidth: undefined,
  defaultWidth: undefined,
  defaultFlex: undefined,
  suppressSizeToFit: false,
  suppressAutoSize: false,
  // Sorting & filtering
  defaultSortable: true,
  defaultFilterable: true,
  unSortIcon: false,
  floatingFilter: true,
  // Editing
  defaultEditable: false,
  suppressPaste: false,
  suppressNavigable: false,
  // Header
  wrapHeaderText: true,
  autoHeaderHeight: true,
  suppressHeaderMenuButton: false,
  // Movement & locking
  suppressMovable: false,
  lockPosition: false,
  lockVisible: false,
  lockPinned: false,
  // Cell content
  wrapText: false,
  autoHeight: false,
  // ON by default — trading-blotter requirement (flash on value change
  // is core ticker UX). The GridOptionsPanel swatch tests encode this
  // default; it was `false` here for a while, which is why those two
  // tests failed on every full-suite run. Perf is bounded by VISIBLE
  // cell changes only (~tens/sec at random-spread feeds), not feed rate.
  enableCellChangeFlash: true,
  // Row grouping / pivoting
  enableRowGroup: true,
  enablePivot: true,
  enableValue: true,
  defaultAggFunc: 'sum',
  // Legacy / shared flags
  enableCellTextSelection: false,
  suppressDragLeaveHidesColumns: true,
  suppressColumnMoveAnimation: false,
  allowDragFromColumnsToolPanel: true,

  // Side Bar — ON by default so a fresh grid ships with the columns +
  // filters tool panels reachable from the button strip. Both panels are
  // enabled; `sideBarDefaultPanel: undefined` leaves the strip visible but
  // no panel pre-opened, so it doesn't steal horizontal space until clicked.
  sideBar: true,
  sideBarShowColumns: true,
  sideBarShowFilters: true,
  sideBarDefaultPanel: undefined,

  // Status Bar — ON by default. The two row-count panels are pre-checked
  // (total/filtered + selected) because that's the typical "I want a status
  // bar" use case; aggregation is opt-in since it requires cell-range
  // selection to be useful.
  statusBar: true,
  statusBarShowTotalAndFilteredCount: true,
  statusBarShowFilteredCount: false,
  statusBarShowTotalCount: false,
  statusBarShowSelectedCount: true,
  statusBarShowAggregation: false,

  // Performance
  // ≤5 visible refreshes/sec by default — trading-blotter operating
  // point (multi-window fleets stay smooth; humans can't read faster).
  // Lowered from 8 after profiling: at 20k rows × 10k updates/sec each
  // grid flush costs 60-170ms of main thread, so 8/sec left ~70% of
  // every second unavailable to interactions (settings drawer, sorts);
  // 5/sec caps that at ~50% with no visible loss of liveness.
  maxGridUpdatesPerSecond: 5,
  rowBuffer: 10,
  suppressScrollOnNewData: false,
  suppressColumnVirtualisation: false,
  suppressRowVirtualisation: false,
  suppressMaxRenderedRowRestriction: false,
  suppressAnimationFrame: false,
  // false = AG Grid default: rows reposition continuously as the thumb drags.
  // true debounces scroll events so rows only jump after the gesture settles —
  // the "janky / rows-move-only-after-scroll" feel. Keep false for smooth tracking.
  debounceVerticalScrollbar: false,
};
