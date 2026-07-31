/**
 * Pure-data declaration of every Grid Options band + field.
 *
 * Every row (label / hint / testId / select options) matches v2-baseline
 * character-for-character — diff against `git show v2-baseline:
 * packages/core/src/modules/general-settings/GridOptionsPanel.tsx` to
 * verify pixel parity. The renderer in `fieldSchema.tsx` emits the same
 * `<Band>` + `<Row>` markup v2 used, so visuals are identical.
 *
 * Adding a new Grid Option: append a record here. No JSX change needed.
 */
import type { BandSchema } from './fieldSchema';
import { BoolControl, NumberControl } from './fieldSchema';
import { SubLabel } from '../../ui/SettingsPanel';
import { CellChangeFlashColorSwatches } from './CellChangeFlashColorSwatches';

export const GRID_OPTIONS_SCHEMA: readonly BandSchema[] = [
  // ─── 01 ESSENTIALS ─────────────────────────────────────────────────
  {
    index: '01',
    title: 'ESSENTIALS',
    fields: [
      { kind: 'num', key: 'rowHeight', label: 'ROW HEIGHT', testId: 'go-row-height', min: 14, suffix: 'PX' },
      { kind: 'num', key: 'headerHeight', label: 'HEADER HEIGHT', testId: 'go-header-height', min: 14, suffix: 'PX' },
      { kind: 'bool', key: 'animateRows', label: 'ANIMATE ROWS', hint: 'Off by default — row slide-in on change; enable for non-streaming UIs', testId: 'go-animate-rows' },
      {
        kind: 'select', key: 'rowSelection', label: 'ROW SELECTION', testId: 'go-row-selection',
        options: [
          { value: undefined, label: 'Off' },
          { value: 'singleRow', label: 'Single row' },
          { value: 'multiRow', label: 'Multiple rows' },
        ],
      },
      { kind: 'bool', key: 'checkboxSelection', label: 'CHECKBOX SELECT', hint: 'Off = no checkbox column or header select-all; click rows to select', testId: 'go-checkbox-select' },
      { kind: 'bool', key: 'cellSelection', label: 'CELL SELECTION', hint: 'Enterprise · range selection for copy / fill', testId: 'go-cell-selection' },
      { kind: 'num', key: 'cellFlashDuration', label: 'FLASH DURATION', hint: 'ms · 0 disables cell-value-change flashing', testId: 'go-flash-duration', min: 0, suffix: 'MS' },
      { kind: 'num', key: 'cellFadeDuration', label: 'FADE DURATION', hint: 'ms · fade-out after the flash hold window', testId: 'go-fade-duration', min: 0, suffix: 'MS' },
      { kind: 'bool', key: 'pagination', label: 'PAGINATION', testId: 'go-pagination' },
      {
        kind: 'conditional',
        show: (s) => s.pagination,
        fields: [
          {
            kind: 'custom', label: 'PAGE SIZE', testId: 'go-page-size-row',
            render: (s, update) => (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <NumberControl
                  value={s.paginationPageSize}
                  onChange={(v) => update('paginationPageSize', v)}
                  min={1}
                  testId="go-page-size"
                />
                <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <BoolControl
                    checked={s.paginationAutoPageSize}
                    onChange={(v) => update('paginationAutoPageSize', v)}
                    testId="go-page-size-auto"
                  />
                  <SubLabel>AUTO</SubLabel>
                </label>
              </div>
            ),
          },
          { kind: 'bool', key: 'suppressPaginationPanel', label: 'HIDE PANEL', hint: 'Hide the built-in pagination footer', testId: 'go-suppress-pagination-panel' },
        ],
      },
      { kind: 'text', key: 'quickFilterText', label: 'QUICK FILTER', hint: 'Live full-text filter across all columns', testId: 'go-quick-filter', placeholder: 'type to filter…' },
    ],
  },

  // ─── 02 ROW GROUPING ───────────────────────────────────────────────
  {
    index: '02',
    title: 'ROW GROUPING',
    fields: [
      {
        kind: 'select', key: 'groupDisplayType', label: 'GROUP DISPLAY', testId: 'go-group-display',
        options: [
          { value: undefined, label: 'Default' },
          { value: 'singleColumn', label: 'Single column' },
          { value: 'multipleColumns', label: 'Multiple columns' },
          { value: 'groupRows', label: 'Group rows' },
          { value: 'custom', label: 'Custom' },
        ],
      },
      { kind: 'num', key: 'groupDefaultExpanded', label: 'DEFAULT EXPAND', hint: '0 = none · N = level count · -1 = expand all', testId: 'go-group-default-expanded' },
      {
        kind: 'select', key: 'rowGroupPanelShow', label: 'ROW GROUP PANEL', testId: 'go-row-group-panel',
        options: [
          { value: 'never', label: 'Never' },
          { value: 'onlyWhenGrouping', label: 'Only when grouping' },
          { value: 'always', label: 'Always' },
        ],
      },
      { kind: 'bool', key: 'rowGroupPanelSuppressSort', label: 'PANEL NO-SORT', hint: 'Suppress sort indicators + actions on row-group-panel chips', testId: 'go-row-group-panel-suppress-sort' },
      { kind: 'bool', key: 'groupHideOpenParents', label: 'HIDE OPEN PARENTS', testId: 'go-group-hide-open-parents' },
      { kind: 'bool', key: 'groupHideColumnsUntilExpanded', label: 'HIDE UNTIL EXPAND', hint: 'Hide deeper group columns until a parent is expanded (CSRM only)', testId: 'go-group-hide-until-expanded' },
      { kind: 'bool', key: 'showOpenedGroup', label: 'SHOW OPENED', hint: 'Display the open group in the group column for non-group rows', testId: 'go-show-opened-group' },
      {
        kind: 'select', key: 'groupHideParentOfSingleChild', label: 'SINGLE-CHILD FLATTEN',
        hint: 'Show the child row in place of the group row when the group has one child', testId: 'go-group-hide-single-child',
        options: [
          { value: false, label: 'Off' },
          { value: true, label: 'All groups' },
          { value: 'leafGroupsOnly', label: 'Leaf groups only' },
        ],
      },
      { kind: 'bool', key: 'groupAllowUnbalanced', label: 'UNBALANCED OK', hint: "Don't create a (Blanks) bucket for rows missing a grouping value", testId: 'go-group-allow-unbalanced' },
      { kind: 'bool', key: 'groupMaintainOrder', label: 'MAINTAIN ORDER', hint: 'Preserve group order when sorting on non-group columns', testId: 'go-group-maintain-order' },
      // UI label is positive ("STICKY GROUPS") but state key is a suppress-flag — invert.
      { kind: 'bool', key: 'suppressGroupRowsSticky', label: 'STICKY GROUPS', hint: 'When off, group rows scroll away with their children (Initial)', testId: 'go-sticky-groups', invert: true },
      { kind: 'num', key: 'groupLockGroupColumns', label: 'LOCK GROUP COLS', hint: 'Lock the first N group columns. 0 = none · -1 = all', testId: 'go-group-lock-group-cols' },
      // UI label is positive ("DRAG LEAVE HIDES") but state is a suppress-flag — invert.
      { kind: 'bool', key: 'suppressDragLeaveHidesColumns', label: 'DRAG LEAVE HIDES', hint: 'Dragging a column to the row-group panel hides it in the grid', testId: 'go-drag-leave-hides', invert: true },
      { kind: 'bool', key: 'allowDragFromColumnsToolPanel', label: 'DRAG FROM PANEL', hint: 'Drag columns from the Columns tool panel onto the grid to show, reorder, or pin them', testId: 'go-allow-drag-from-tool-panel' },
      {
        kind: 'select', key: 'suppressGroupChangesColumnVisibility', label: 'VIS ON GROUP CHG',
        hint: 'Keep column visibility stable when grouping changes', testId: 'go-suppress-group-changes-visibility',
        options: [
          { value: false, label: 'Default — show/hide on group change' },
          { value: true, label: 'Always keep visibility fixed' },
          { value: 'suppressHideOnGroup', label: 'Only suppress auto-hide on group' },
          { value: 'suppressShowOnUngroup', label: 'Only suppress auto-show on ungroup' },
        ],
      },
      { kind: 'bool', key: 'refreshAfterGroupEdit', label: 'REFRESH AFTER EDIT', hint: 'Re-evaluate hierarchy after editing a grouped column value', testId: 'go-refresh-after-group-edit' },
      { kind: 'bool', key: 'ssrmExpandAllAffectsAllRows', label: 'SSRM EXPAND-ALL', hint: 'Server-side row model · expandAll applies to all rows (requires getRowId)', testId: 'go-ssrm-expand-all' },
    ],
  },

  // ─── 03 PIVOT · TOTALS · AGGREGATION ───────────────────────────────
  {
    index: '03',
    title: 'PIVOT · TOTALS · AGGREGATION',
    fields: [
      { kind: 'bool', key: 'pivotMode', label: 'PIVOT MODE', testId: 'go-pivot-mode' },
      {
        kind: 'select', key: 'pivotPanelShow', label: 'PIVOT PANEL', testId: 'go-pivot-panel',
        options: [
          { value: 'never', label: 'Never' },
          { value: 'onlyWhenPivoting', label: 'Only when pivoting' },
          { value: 'always', label: 'Always' },
        ],
      },
      {
        kind: 'select', key: 'grandTotalRow', label: 'GRAND TOTAL', testId: 'go-grand-total',
        options: [
          { value: undefined, label: 'None' },
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
          { value: 'pinnedTop', label: 'Pinned top' },
          { value: 'pinnedBottom', label: 'Pinned bottom' },
        ],
      },
      {
        kind: 'select', key: 'groupTotalRow', label: 'GROUP TOTAL', testId: 'go-group-total',
        options: [
          { value: undefined, label: 'None' },
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
        ],
      },
      { kind: 'bool', key: 'suppressAggFuncInHeader', label: 'SUPPRESS AGG', hint: 'Strip aggregation function names from group headers', testId: 'go-suppress-agg-in-header' },
      {
        kind: 'select', key: 'defaultAggFunc', label: 'DEFAULT AGG', testId: 'go-default-agg-func',
        hint: 'Aggregation applied to value columns by default',
        options: [
          { value: undefined, label: 'None' },
          { value: 'sum', label: 'Sum' },
          { value: 'avg', label: 'Avg' },
          { value: 'min', label: 'Min' },
          { value: 'max', label: 'Max' },
          { value: 'count', label: 'Count' },
          { value: 'first', label: 'First' },
          { value: 'last', label: 'Last' },
        ],
      },
    ],
  },

  // ─── 04 FILTER · SORT · CLIPBOARD ──────────────────────────────────
  {
    index: '04',
    title: 'FILTER · SORT · CLIPBOARD',
    fields: [
      { kind: 'bool', key: 'enableAdvancedFilter', label: 'ADVANCED FILTER', testId: 'go-advanced-filter' },
      { kind: 'bool', key: 'includeHiddenColumnsInQuickFilter', label: 'HIDDEN COL QF', hint: 'Include hidden columns in quick-filter matches', testId: 'go-hidden-cols-in-qf' },
      {
        kind: 'select', key: 'multiSortMode', label: 'MULTI SORT', hint: 'How clicking a header extends the sort set', testId: 'go-multi-sort',
        options: [
          { value: 'replace', label: 'Click replaces sort' },
          { value: 'shift', label: 'Shift-click to add' },
          { value: 'ctrl', label: 'Ctrl-click to add' },
          { value: 'always', label: 'Click always adds' },
        ],
      },
      { kind: 'bool', key: 'accentedSort', label: 'ACCENTED SORT', hint: 'Locale-aware comparisons (slower)', testId: 'go-accented-sort' },
      { kind: 'bool', key: 'copyHeadersToClipboard', label: 'COPY HEADERS', testId: 'go-copy-headers' },
      {
        kind: 'select', key: 'clipboardDelimiter', label: 'CLIP DELIMITER', testId: 'go-clipboard-delimiter',
        options: [
          { value: '\t', label: 'Tab' },
          { value: ',', label: 'Comma' },
          { value: ';', label: 'Semicolon' },
          { value: '|', label: 'Pipe' },
        ],
      },
    ],
  },

  // ─── 05 EDITING · INTERACTION ──────────────────────────────────────
  {
    index: '05',
    title: 'EDITING · INTERACTION',
    fields: [
      { kind: 'bool', key: 'singleClickEdit', label: 'SINGLE CLICK EDIT', testId: 'go-single-click-edit' },
      { kind: 'bool', key: 'stopEditingWhenCellsLoseFocus', label: 'STOP ON BLUR', hint: 'Commit the edit when the cell loses focus', testId: 'go-stop-on-blur' },
      {
        kind: 'select', key: 'enterNavigation', label: 'ENTER NAVIGATES', hint: 'What Enter does in / after an edit', testId: 'go-enter-navigation',
        options: [
          { value: 'default', label: 'Default (commit only)' },
          { value: 'always', label: 'Always move down' },
          { value: 'afterEdit', label: 'Move down after edit' },
          { value: 'both', label: 'Move down always + after edit' },
        ],
      },
      {
        kind: 'custom', label: 'UNDO / REDO', testId: 'go-undo-redo-row',
        render: (s, update) => (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <BoolControl
              checked={s.undoRedoCellEditing}
              onChange={(v) => update('undoRedoCellEditing', v)}
              testId="go-undo-redo"
            />
            {s.undoRedoCellEditing && (
              <>
                <SubLabel>LIMIT</SubLabel>
                <NumberControl
                  value={s.undoRedoCellEditingLimit}
                  onChange={(v) => update('undoRedoCellEditingLimit', v)}
                  min={1}
                  testId="go-undo-redo-limit"
                />
              </>
            )}
          </div>
        ),
      },
      { kind: 'num', key: 'tooltipShowDelay', label: 'TOOLTIP DELAY', hint: 'ms before tooltips appear on hover', testId: 'go-tooltip-delay', min: 0, suffix: 'MS' },
      {
        kind: 'select', key: 'tooltipShowMode', label: 'TOOLTIP MODE', testId: 'go-tooltip-mode',
        options: [
          { value: 'standard', label: 'Always show' },
          { value: 'whenTruncated', label: 'Only when truncated' },
        ],
      },
    ],
  },

  // ─── 06 STYLING ────────────────────────────────────────────────────
  {
    index: '06',
    title: 'STYLING',
    fields: [
      { kind: 'bool', key: 'suppressRowHoverHighlight', label: 'ROW HOVER', hint: 'Suppress the hover highlight on rows', testId: 'go-suppress-row-hover' },
      { kind: 'bool', key: 'columnHoverHighlight', label: 'COLUMN HOVER', hint: 'Highlight the whole column on header hover', testId: 'go-column-hover' },
    ],
  },

  // ─── 07 DEFAULT COLDEF (7 subsections) ─────────────────────────────
  {
    index: '07',
    title: 'DEFAULT COLDEF',
    fields: [
      {
        kind: 'subsection', title: 'SIZING', fields: [
          { kind: 'bool', key: 'defaultResizable', label: 'RESIZABLE', hint: 'Allow drag-resizing on every column', testId: 'go-default-resizable' },
          { kind: 'num', key: 'defaultMinWidth', label: 'MIN WIDTH', testId: 'go-default-min-width', min: 0, suffix: 'PX' },
          { kind: 'optNum', key: 'defaultMaxWidth', label: 'MAX WIDTH', hint: 'Blank = no cap', testId: 'go-default-max-width', min: 1, suffix: 'PX' },
          { kind: 'optNum', key: 'defaultWidth', label: 'WIDTH', hint: "Default pixel width · blank = use AG-Grid's auto-calc", testId: 'go-default-width', min: 1, suffix: 'PX' },
          { kind: 'optNum', key: 'defaultFlex', label: 'FLEX', hint: 'Share of remaining space (higher = wider) · blank = off', testId: 'go-default-flex', min: 0 },
          { kind: 'bool', key: 'suppressSizeToFit', label: 'NO SIZE-TO-FIT', hint: 'Exclude from api.sizeColumnsToFit()', testId: 'go-suppress-size-to-fit' },
          { kind: 'bool', key: 'suppressAutoSize', label: 'NO AUTO-SIZE', hint: 'Block header double-click to auto-size', testId: 'go-suppress-auto-size' },
        ],
      },
      {
        kind: 'subsection', title: 'SORT & FILTER', fields: [
          { kind: 'bool', key: 'defaultSortable', label: 'SORTABLE', testId: 'go-default-sortable' },
          { kind: 'bool', key: 'defaultFilterable', label: 'FILTERABLE', testId: 'go-default-filterable' },
          { kind: 'bool', key: 'unSortIcon', label: 'UNSORT ICON', hint: 'Show an un-sort indicator on hoverable header', testId: 'go-unsort-icon' },
          { kind: 'bool', key: 'floatingFilter', label: 'FLOATING FILTER', hint: 'Render a live filter row below each column header', testId: 'go-floating-filter' },
        ],
      },
      {
        kind: 'subsection', title: 'EDITING', fields: [
          { kind: 'bool', key: 'defaultEditable', label: 'EDITABLE', testId: 'go-default-editable' },
          { kind: 'bool', key: 'suppressPaste', label: 'SUPPRESS PASTE', hint: 'Block paste into cells', testId: 'go-suppress-paste' },
          { kind: 'bool', key: 'suppressNavigable', label: 'NOT NAVIGABLE', hint: 'Skip cells in keyboard navigation', testId: 'go-suppress-navigable' },
        ],
      },
      {
        kind: 'subsection', title: 'HEADER', fields: [
          { kind: 'bool', key: 'wrapHeaderText', label: 'WRAP HEADER', testId: 'go-wrap-header' },
          { kind: 'bool', key: 'autoHeaderHeight', label: 'AUTO HEADER H', hint: 'Grow the header row to fit wrapped text', testId: 'go-auto-header-height' },
          { kind: 'bool', key: 'suppressHeaderMenuButton', label: 'HIDE MENU BTN', hint: 'Remove the hamburger menu from every column header', testId: 'go-suppress-header-menu-btn' },
        ],
      },
      {
        kind: 'subsection', title: 'MOVEMENT & LOCKING', fields: [
          { kind: 'bool', key: 'suppressMovable', label: 'SUPPRESS MOVE', hint: 'Lock every column against drag-to-reorder', testId: 'go-suppress-movable' },
          {
            kind: 'select', key: 'lockPosition', label: 'LOCK POSITION',
            hint: 'Pin every column to a side in the column model', testId: 'go-lock-position',
            options: [
              { value: false, label: 'Off' },
              { value: true, label: 'Locked (default side)' },
              { value: 'left', label: 'Locked left' },
              { value: 'right', label: 'Locked right' },
            ],
          },
          { kind: 'bool', key: 'lockVisible', label: 'LOCK VISIBLE', hint: 'Prevent hide/show from the UI', testId: 'go-lock-visible' },
          { kind: 'bool', key: 'lockPinned', label: 'LOCK PINNED', hint: 'Prevent pin/unpin from the UI', testId: 'go-lock-pinned' },
        ],
      },
      {
        kind: 'subsection', title: 'CELL CONTENT', fields: [
          { kind: 'bool', key: 'wrapText', label: 'WRAP TEXT', hint: 'Wrap long cell text across multiple lines', testId: 'go-wrap-text' },
          { kind: 'bool', key: 'autoHeight', label: 'AUTO HEIGHT', hint: 'Auto-size row height to fit wrapped content', testId: 'go-auto-height' },
          { kind: 'bool', key: 'enableCellChangeFlash', label: 'FLASH ON CHANGE', hint: 'Flash the cell background when its value changes', testId: 'go-enable-cell-change-flash' },
          {
            kind: 'conditional',
            show: (s) => s.enableCellChangeFlash,
            fields: [
              {
                kind: 'custom',
                label: 'FLASH COLOR',
                hint: 'Background tint for AG-Grid cell value-change flash',
                testId: 'go-cell-change-flash-color',
                render: (s, update) => (
                  <CellChangeFlashColorSwatches
                    value={s.cellChangeFlashColor}
                    onChange={(color) => update('cellChangeFlashColor', color)}
                  />
                ),
              },
            ],
          },
        ],
      },
      {
        kind: 'subsection', title: 'GROUPING · PIVOT · VALUES (Enterprise)', fields: [
          { kind: 'bool', key: 'enableRowGroup', label: 'ROW GROUP', hint: 'Allow dragging columns into the row-group panel', testId: 'go-enable-row-group' },
          { kind: 'bool', key: 'enablePivot', label: 'PIVOT', hint: 'Allow dragging columns into the pivot panel', testId: 'go-enable-pivot' },
          { kind: 'bool', key: 'enableValue', label: 'VALUES', hint: 'Allow dragging columns into the values / aggregations panel', testId: 'go-enable-value' },
        ],
      },
    ],
  },

  // ─── 08 SIDE BAR ───────────────────────────────────────────────────
  {
    index: '08',
    title: 'SIDE BAR',
    fields: [
      { kind: 'bool', key: 'sideBar', label: 'SHOW SIDE BAR', hint: "AG-Grid's tool-panel side bar (right edge of the grid)", testId: 'go-side-bar' },
      {
        kind: 'conditional',
        show: (s) => s.sideBar,
        fields: [
          { kind: 'bool', key: 'sideBarShowColumns', label: 'COLUMNS PANEL', hint: 'Drag-and-drop column show/hide + grouping', testId: 'go-side-bar-columns' },
          { kind: 'bool', key: 'sideBarShowFilters', label: 'FILTERS PANEL', hint: 'Per-column filter editors stacked in the side bar', testId: 'go-side-bar-filters' },
          {
            kind: 'select', key: 'sideBarDefaultPanel', label: 'DEFAULT PANEL',
            hint: 'Which panel opens when the side bar first appears', testId: 'go-side-bar-default',
            options: [
              { value: undefined, label: 'Closed (user must click a tab)' },
              { value: 'columns', label: 'Columns' },
              { value: 'filters', label: 'Filters' },
            ],
          },
        ],
      },
    ],
  },

  // ─── 09 STATUS BAR ─────────────────────────────────────────────────
  {
    index: '09',
    title: 'STATUS BAR',
    fields: [
      { kind: 'bool', key: 'statusBar', label: 'SHOW STATUS BAR', hint: 'Counter row at the bottom of the grid', testId: 'go-status-bar' },
      {
        kind: 'conditional',
        show: (s) => s.statusBar,
        fields: [
          { kind: 'bool', key: 'statusBarShowTotalAndFilteredCount', label: 'TOTAL + FILTERED', hint: '"X of Y rows" — single panel covering both counts', testId: 'go-status-bar-total-filtered' },
          { kind: 'bool', key: 'statusBarShowFilteredCount', label: 'FILTERED COUNT', hint: 'Filtered-row count alone', testId: 'go-status-bar-filtered' },
          { kind: 'bool', key: 'statusBarShowTotalCount', label: 'TOTAL COUNT', hint: 'Total-row count alone', testId: 'go-status-bar-total' },
          { kind: 'bool', key: 'statusBarShowSelectedCount', label: 'SELECTED COUNT', testId: 'go-status-bar-selected' },
          { kind: 'bool', key: 'statusBarShowAggregation', label: 'AGGREGATION', hint: 'Sum / Avg / Min / Max of the current cell-range selection', testId: 'go-status-bar-aggregation' },
        ],
      },
    ],
  },

  // ─── 10 PERFORMANCE (ADVANCED) ─────────────────────────────────────
  {
    index: '10',
    title: 'PERFORMANCE (ADVANCED)',
    fields: [
      { kind: 'num', key: 'maxGridUpdatesPerSecond', label: 'MAX UPDATES / SEC', hint: 'Cap grid refresh flushes per second · ticks batch and flash with final values · 0 = uncapped', testId: 'go-max-updates-per-sec', min: 0 },
      { kind: 'num', key: 'rowBuffer', label: 'ROW BUFFER', hint: 'Rows rendered outside viewport · 5-50 practical', testId: 'go-row-buffer', min: 0 },
      { kind: 'bool', key: 'suppressScrollOnNewData', label: 'NO SCROLL RESET', hint: 'Keep scroll position when new rowData arrives', testId: 'go-suppress-scroll-on-new-data' },
      { kind: 'bool', key: 'suppressColumnVirtualisation', label: 'NO COL VIRT', hint: 'Initial · remount required · 200+ col grids', testId: 'go-suppress-col-virt' },
      { kind: 'bool', key: 'suppressRowVirtualisation', label: 'NO ROW VIRT', hint: 'Initial · remount required', testId: 'go-suppress-row-virt' },
      { kind: 'bool', key: 'suppressMaxRenderedRowRestriction', label: 'NO RENDER CAP', hint: 'Initial · remount required · only meaningful if row virt off', testId: 'go-suppress-render-cap' },
      { kind: 'bool', key: 'suppressAnimationFrame', label: 'NO RAF', hint: 'Initial · remount required · expert-only', testId: 'go-suppress-raf' },
      { kind: 'bool', key: 'debounceVerticalScrollbar', label: 'DEBOUNCE VSCROLL', hint: 'Initial · remount required', testId: 'go-debounce-vscroll' },
    ],
  },
];
