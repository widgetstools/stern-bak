/**
 * The Grid Options catalogue — every key `update_module_settings` accepts on
 * the `general-settings` module, with the label and hint the settings drawer
 * shows for it.
 *
 * MIRRORED, not imported, for the same reason as `cellRenderers.ts`: the real
 * declaration (`gridOptionsSchema.tsx` in the grid package) is a .tsx holding
 * JSX editors and React controls, which have no business in a window that
 * mounts no grid. `generalSettingsCatalog.test.ts` asserts this list matches
 * the real state shape key-for-key, so a new Grid Option cannot ship without
 * being documented here.
 *
 * This exists because the model previously had a 909-character guide against a
 * 100+ key surface: it had to guess key names, and an unknown key writes
 * cleanly and does nothing.
 */

export interface GridOptionEntry {
  /** The settings key — exactly what goes in `update_module_settings`. */
  key: string;
  /** Which band of the settings drawer it appears under. */
  band: string;
  kind: string;
  label?: string;
  hint?: string;
  /** For select fields: the accepted values. `undefined` means "unset". */
  options?: unknown[];
}

export const GRID_OPTION_ENTRIES: readonly GridOptionEntry[] = [
  { key: 'rowHeight', band: '01 ESSENTIALS', kind: 'num', label: 'ROW HEIGHT' },
  { key: 'headerHeight', band: '01 ESSENTIALS', kind: 'num', label: 'HEADER HEIGHT' },
  { key: 'animateRows', band: '01 ESSENTIALS', kind: 'bool', label: 'ANIMATE ROWS', hint: 'Off by default — row slide-in on change; enable for non-streaming UIs' },
  { key: 'rowSelection', band: '01 ESSENTIALS', kind: 'select', label: 'ROW SELECTION', options: [null, "singleRow", "multiRow"] },
  { key: 'checkboxSelection', band: '01 ESSENTIALS', kind: 'bool', label: 'CHECKBOX SELECT', hint: 'Off = no checkbox column or header select-all; click rows to select' },
  { key: 'cellSelection', band: '01 ESSENTIALS', kind: 'bool', label: 'CELL SELECTION', hint: 'Enterprise · range selection for copy / fill' },
  { key: 'cellFlashDuration', band: '01 ESSENTIALS', kind: 'num', label: 'FLASH DURATION', hint: 'ms · 0 disables cell-value-change flashing' },
  { key: 'cellFadeDuration', band: '01 ESSENTIALS', kind: 'num', label: 'FADE DURATION', hint: 'ms · fade-out after the flash hold window' },
  { key: 'pagination', band: '01 ESSENTIALS', kind: 'bool', label: 'PAGINATION' },
  { key: 'suppressPaginationPanel', band: '01 ESSENTIALS', kind: 'bool', label: 'HIDE PANEL', hint: 'Hide the built-in pagination footer' },
  { key: 'quickFilterText', band: '01 ESSENTIALS', kind: 'text', label: 'QUICK FILTER', hint: 'Live full-text filter across all columns' },
  { key: 'groupDisplayType', band: '02 ROW GROUPING', kind: 'select', label: 'GROUP DISPLAY', options: [null, "singleColumn", "multipleColumns", "groupRows", "custom"] },
  { key: 'groupDefaultExpanded', band: '02 ROW GROUPING', kind: 'num', label: 'DEFAULT EXPAND', hint: '0 = none · N = level count · -1 = expand all' },
  { key: 'rowGroupPanelShow', band: '02 ROW GROUPING', kind: 'select', label: 'ROW GROUP PANEL', options: ["never", "onlyWhenGrouping", "always"] },
  { key: 'rowGroupPanelSuppressSort', band: '02 ROW GROUPING', kind: 'bool', label: 'PANEL NO-SORT', hint: 'Suppress sort indicators + actions on row-group-panel chips' },
  { key: 'groupHideOpenParents', band: '02 ROW GROUPING', kind: 'bool', label: 'HIDE OPEN PARENTS' },
  { key: 'groupHideColumnsUntilExpanded', band: '02 ROW GROUPING', kind: 'bool', label: 'HIDE UNTIL EXPAND', hint: 'Hide deeper group columns until a parent is expanded (CSRM only)' },
  { key: 'showOpenedGroup', band: '02 ROW GROUPING', kind: 'bool', label: 'SHOW OPENED', hint: 'Display the open group in the group column for non-group rows' },
  { key: 'groupHideParentOfSingleChild', band: '02 ROW GROUPING', kind: 'select', label: 'SINGLE-CHILD FLATTEN', hint: 'Show the child row in place of the group row when the group has one child', options: [false, true, "leafGroupsOnly"] },
  { key: 'groupAllowUnbalanced', band: '02 ROW GROUPING', kind: 'bool', label: 'UNBALANCED OK', hint: 'Don\'t create a (Blanks) bucket for rows missing a grouping value' },
  { key: 'groupMaintainOrder', band: '02 ROW GROUPING', kind: 'bool', label: 'MAINTAIN ORDER', hint: 'Preserve group order when sorting on non-group columns' },
  { key: 'suppressGroupRowsSticky', band: '02 ROW GROUPING', kind: 'bool', label: 'STICKY GROUPS', hint: 'When off, group rows scroll away with their children (Initial)' },
  { key: 'groupLockGroupColumns', band: '02 ROW GROUPING', kind: 'num', label: 'LOCK GROUP COLS', hint: 'Lock the first N group columns. 0 = none · -1 = all' },
  { key: 'suppressDragLeaveHidesColumns', band: '02 ROW GROUPING', kind: 'bool', label: 'DRAG LEAVE HIDES', hint: 'Dragging a column to the row-group panel hides it in the grid' },
  { key: 'allowDragFromColumnsToolPanel', band: '02 ROW GROUPING', kind: 'bool', label: 'DRAG FROM PANEL', hint: 'Drag columns from the Columns tool panel onto the grid to show, reorder, or pin them' },
  { key: 'suppressGroupChangesColumnVisibility', band: '02 ROW GROUPING', kind: 'select', label: 'VIS ON GROUP CHG', hint: 'Keep column visibility stable when grouping changes', options: [false, true, "suppressHideOnGroup", "suppressShowOnUngroup"] },
  { key: 'refreshAfterGroupEdit', band: '02 ROW GROUPING', kind: 'bool', label: 'REFRESH AFTER EDIT', hint: 'Re-evaluate hierarchy after editing a grouped column value' },
  { key: 'ssrmExpandAllAffectsAllRows', band: '02 ROW GROUPING', kind: 'bool', label: 'SSRM EXPAND-ALL', hint: 'Server-side row model · expandAll applies to all rows (requires getRowId)' },
  { key: 'pivotMode', band: '03 PIVOT · TOTALS · AGGREGATION', kind: 'bool', label: 'PIVOT MODE' },
  { key: 'pivotPanelShow', band: '03 PIVOT · TOTALS · AGGREGATION', kind: 'select', label: 'PIVOT PANEL', options: ["never", "onlyWhenPivoting", "always"] },
  { key: 'grandTotalRow', band: '03 PIVOT · TOTALS · AGGREGATION', kind: 'select', label: 'GRAND TOTAL', options: [null, "top", "bottom", "pinnedTop", "pinnedBottom"] },
  { key: 'groupTotalRow', band: '03 PIVOT · TOTALS · AGGREGATION', kind: 'select', label: 'GROUP TOTAL', options: [null, "top", "bottom"] },
  { key: 'suppressAggFuncInHeader', band: '03 PIVOT · TOTALS · AGGREGATION', kind: 'bool', label: 'SUPPRESS AGG', hint: 'Strip aggregation function names from group headers' },
  { key: 'defaultAggFunc', band: '03 PIVOT · TOTALS · AGGREGATION', kind: 'select', label: 'DEFAULT AGG', hint: 'Aggregation applied to value columns by default', options: [null, "sum", "avg", "min", "max", "count", "first", "last"] },
  { key: 'enableAdvancedFilter', band: '04 FILTER · SORT · CLIPBOARD', kind: 'bool', label: 'ADVANCED FILTER' },
  { key: 'includeHiddenColumnsInQuickFilter', band: '04 FILTER · SORT · CLIPBOARD', kind: 'bool', label: 'HIDDEN COL QF', hint: 'Include hidden columns in quick-filter matches' },
  { key: 'multiSortMode', band: '04 FILTER · SORT · CLIPBOARD', kind: 'select', label: 'MULTI SORT', hint: 'How clicking a header extends the sort set', options: ["replace", "shift", "ctrl", "always"] },
  { key: 'accentedSort', band: '04 FILTER · SORT · CLIPBOARD', kind: 'bool', label: 'ACCENTED SORT', hint: 'Locale-aware comparisons (slower)' },
  { key: 'copyHeadersToClipboard', band: '04 FILTER · SORT · CLIPBOARD', kind: 'bool', label: 'COPY HEADERS' },
  { key: 'clipboardDelimiter', band: '04 FILTER · SORT · CLIPBOARD', kind: 'select', label: 'CLIP DELIMITER', options: ["\t", ",", ";", "|"] },
  { key: 'singleClickEdit', band: '05 EDITING · INTERACTION', kind: 'bool', label: 'SINGLE CLICK EDIT' },
  { key: 'stopEditingWhenCellsLoseFocus', band: '05 EDITING · INTERACTION', kind: 'bool', label: 'STOP ON BLUR', hint: 'Commit the edit when the cell loses focus' },
  { key: 'enterNavigation', band: '05 EDITING · INTERACTION', kind: 'select', label: 'ENTER NAVIGATES', hint: 'What Enter does in / after an edit', options: ["default", "always", "afterEdit", "both"] },
  { key: 'tooltipShowDelay', band: '05 EDITING · INTERACTION', kind: 'num', label: 'TOOLTIP DELAY', hint: 'ms before tooltips appear on hover' },
  { key: 'tooltipShowMode', band: '05 EDITING · INTERACTION', kind: 'select', label: 'TOOLTIP MODE', options: ["standard", "whenTruncated"] },
  { key: 'suppressRowHoverHighlight', band: '06 STYLING', kind: 'bool', label: 'ROW HOVER', hint: 'Suppress the hover highlight on rows' },
  { key: 'columnHoverHighlight', band: '06 STYLING', kind: 'bool', label: 'COLUMN HOVER', hint: 'Highlight the whole column on header hover' },
  { key: 'defaultResizable', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'RESIZABLE', hint: 'Allow drag-resizing on every column' },
  { key: 'defaultMinWidth', band: '07 DEFAULT COLDEF', kind: 'num', label: 'MIN WIDTH' },
  { key: 'defaultMaxWidth', band: '07 DEFAULT COLDEF', kind: 'optNum', label: 'MAX WIDTH', hint: 'Blank = no cap' },
  { key: 'defaultWidth', band: '07 DEFAULT COLDEF', kind: 'optNum', label: 'WIDTH', hint: 'Default pixel width · blank = use AG-Grid\'s auto-calc' },
  { key: 'defaultFlex', band: '07 DEFAULT COLDEF', kind: 'optNum', label: 'FLEX', hint: 'Share of remaining space (higher = wider) · blank = off' },
  { key: 'suppressSizeToFit', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'NO SIZE-TO-FIT', hint: 'Exclude from api.sizeColumnsToFit()' },
  { key: 'suppressAutoSize', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'NO AUTO-SIZE', hint: 'Block header double-click to auto-size' },
  { key: 'defaultSortable', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'SORTABLE' },
  { key: 'defaultFilterable', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'FILTERABLE' },
  { key: 'unSortIcon', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'UNSORT ICON', hint: 'Show an un-sort indicator on hoverable header' },
  { key: 'floatingFilter', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'FLOATING FILTER', hint: 'Render a live filter row below each column header' },
  { key: 'defaultEditable', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'EDITABLE' },
  { key: 'suppressPaste', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'SUPPRESS PASTE', hint: 'Block paste into cells' },
  { key: 'suppressNavigable', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'NOT NAVIGABLE', hint: 'Skip cells in keyboard navigation' },
  { key: 'wrapHeaderText', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'WRAP HEADER' },
  { key: 'autoHeaderHeight', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'AUTO HEADER H', hint: 'Grow the header row to fit wrapped text' },
  { key: 'suppressHeaderMenuButton', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'HIDE MENU BTN', hint: 'Remove the hamburger menu from every column header' },
  { key: 'suppressMovable', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'SUPPRESS MOVE', hint: 'Lock every column against drag-to-reorder' },
  { key: 'lockPosition', band: '07 DEFAULT COLDEF', kind: 'select', label: 'LOCK POSITION', hint: 'Pin every column to a side in the column model', options: [false, true, "left", "right"] },
  { key: 'lockVisible', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'LOCK VISIBLE', hint: 'Prevent hide/show from the UI' },
  { key: 'lockPinned', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'LOCK PINNED', hint: 'Prevent pin/unpin from the UI' },
  { key: 'wrapText', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'WRAP TEXT', hint: 'Wrap long cell text across multiple lines' },
  { key: 'autoHeight', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'AUTO HEIGHT', hint: 'Auto-size row height to fit wrapped content' },
  { key: 'enableCellChangeFlash', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'FLASH ON CHANGE', hint: 'Flash the cell background when its value changes' },
  { key: 'enableRowGroup', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'ROW GROUP', hint: 'Allow dragging columns into the row-group panel' },
  { key: 'enablePivot', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'PIVOT', hint: 'Allow dragging columns into the pivot panel' },
  { key: 'enableValue', band: '07 DEFAULT COLDEF', kind: 'bool', label: 'VALUES', hint: 'Allow dragging columns into the values / aggregations panel' },
  { key: 'sideBar', band: '08 SIDE BAR', kind: 'bool', label: 'SHOW SIDE BAR', hint: 'AG-Grid\'s tool-panel side bar (right edge of the grid)' },
  { key: 'sideBarShowColumns', band: '08 SIDE BAR', kind: 'bool', label: 'COLUMNS PANEL', hint: 'Drag-and-drop column show/hide + grouping' },
  { key: 'sideBarShowFilters', band: '08 SIDE BAR', kind: 'bool', label: 'FILTERS PANEL', hint: 'Per-column filter editors stacked in the side bar' },
  { key: 'sideBarDefaultPanel', band: '08 SIDE BAR', kind: 'select', label: 'DEFAULT PANEL', hint: 'Which panel opens when the side bar first appears', options: [null, "columns", "filters"] },
  { key: 'statusBar', band: '09 STATUS BAR', kind: 'bool', label: 'SHOW STATUS BAR', hint: 'Counter row at the bottom of the grid' },
  { key: 'statusBarShowTotalAndFilteredCount', band: '09 STATUS BAR', kind: 'bool', label: 'TOTAL + FILTERED', hint: '"X of Y rows" — single panel covering both counts' },
  { key: 'statusBarShowFilteredCount', band: '09 STATUS BAR', kind: 'bool', label: 'FILTERED COUNT', hint: 'Filtered-row count alone' },
  { key: 'statusBarShowTotalCount', band: '09 STATUS BAR', kind: 'bool', label: 'TOTAL COUNT', hint: 'Total-row count alone' },
  { key: 'statusBarShowSelectedCount', band: '09 STATUS BAR', kind: 'bool', label: 'SELECTED COUNT' },
  { key: 'statusBarShowAggregation', band: '09 STATUS BAR', kind: 'bool', label: 'AGGREGATION', hint: 'Sum / Avg / Min / Max of the current cell-range selection' },
  { key: 'maxGridUpdatesPerSecond', band: '10 PERFORMANCE (ADVANCED)', kind: 'num', label: 'MAX UPDATES / SEC', hint: 'Cap grid refresh flushes per second · ticks batch and flash with final values · 0 = uncapped' },
  { key: 'rowBuffer', band: '10 PERFORMANCE (ADVANCED)', kind: 'num', label: 'ROW BUFFER', hint: 'Rows rendered outside viewport · 5-50 practical' },
  { key: 'suppressScrollOnNewData', band: '10 PERFORMANCE (ADVANCED)', kind: 'bool', label: 'NO SCROLL RESET', hint: 'Keep scroll position when new rowData arrives' },
  { key: 'suppressColumnVirtualisation', band: '10 PERFORMANCE (ADVANCED)', kind: 'bool', label: 'NO COL VIRT', hint: 'Initial · remount required · 200+ col grids' },
  { key: 'suppressRowVirtualisation', band: '10 PERFORMANCE (ADVANCED)', kind: 'bool', label: 'NO ROW VIRT', hint: 'Initial · remount required' },
  { key: 'suppressMaxRenderedRowRestriction', band: '10 PERFORMANCE (ADVANCED)', kind: 'bool', label: 'NO RENDER CAP', hint: 'Initial · remount required · only meaningful if row virt off' },
  { key: 'suppressAnimationFrame', band: '10 PERFORMANCE (ADVANCED)', kind: 'bool', label: 'NO RAF', hint: 'Initial · remount required · expert-only' },
  { key: 'debounceVerticalScrollbar', band: '10 PERFORMANCE (ADVANCED)', kind: 'bool', label: 'DEBOUNCE VSCROLL', hint: 'Initial · remount required' },
  { key: 'gridDensity', band: '01 ESSENTIALS', kind: 'select', hint: 'Row density preset', options: ["compact", "standard", "comfortable"] },
  { key: 'paginationPageSize', band: '01 ESSENTIALS', kind: 'num', hint: 'Rows per page when pagination is on' },
  { key: 'paginationAutoPageSize', band: '01 ESSENTIALS', kind: 'bool', hint: 'Size pages to fit the viewport' },
  { key: 'rowDragging', band: '05 EDITING · INTERACTION', kind: 'bool', hint: 'Let rows be dragged to reorder' },
  { key: 'cellChangeFlashColor', band: '06 STYLING', kind: 'select', hint: 'Flash colour name (amber, emerald, rose, sky, violet, teal, orange, slate)', options: ["amber", "emerald", "rose", "sky", "violet", "teal", "orange", "slate"] },
  { key: 'undoRedoCellEditing', band: '05 EDITING · INTERACTION', kind: 'bool', hint: 'Enable AG-Grid native undo/redo for cell edits' },
  { key: 'undoRedoCellEditingLimit', band: '05 EDITING · INTERACTION', kind: 'num', hint: 'How many edit steps undo/redo keeps' },
  { key: 'headerCaseUppercase', band: '06 STYLING', kind: 'bool', hint: 'Force column headers to upper case (also set by the formatter toolbar)' },
  { key: 'showCellTooltips', band: '06 STYLING', kind: 'bool', hint: 'Show a tooltip with the cell value (also set by the formatter toolbar)' },
  { key: 'enableCellTextSelection', band: '05 EDITING · INTERACTION', kind: 'bool', hint: 'Allow selecting cell text with the mouse' },
  { key: 'suppressColumnMoveAnimation', band: '10 PERFORMANCE (ADVANCED)', kind: 'bool', hint: 'Skip the animation when columns move' },];

export const GRID_OPTION_KEYS: readonly string[] = GRID_OPTION_ENTRIES.map((e) => e.key);

export function findGridOption(key: string): GridOptionEntry | undefined {
  return GRID_OPTION_ENTRIES.find((e) => e.key === key);
}

/**
 * Renders the catalogue as the `general-settings` guide body. Generated rather
 * than written so the guide cannot drift from the catalogue, and the
 * catalogue cannot drift from the grid (see the test).
 */
export function buildGeneralSettingsGuide(): string {
  const bands = new Map<string, GridOptionEntry[]>();
  for (const entry of GRID_OPTION_ENTRIES) {
    const list = bands.get(entry.band) ?? [];
    list.push(entry);
    bands.set(entry.band, list);
  }

  const sections = [...bands.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([band, entries]) => {
      const rows = entries
        .map((e) => {
          const opts = e.options
            ? ` One of: ${e.options.map((o) => (o === undefined ? 'unset' : JSON.stringify(o))).join(', ')}.`
            : '';
          const desc = [e.label, e.hint].filter(Boolean).join(' — ');
          return `- \`${e.key}\` (${e.kind})${desc ? ` — ${desc}` : ''}${opts}`;
        })
        .join('\n');
      return `### ${band}\n\n${rows}`;
    })
    .join('\n\n');

  return `## general-settings

Grid-wide options. Read with get_module_settings, change with
update_module_settings — it shallow-merges, so send ONLY the keys you are
changing. An unknown key writes cleanly and does nothing, so use these exact
names.

\`\`\`json
{ "targetGridId": "grid-axe-blotter", "moduleId": "general-settings",
  "settings": { "rowHeight": 24, "enableCellChangeFlash": true } }
\`\`\`

Two that come up constantly and are easy to miss:

- **Expand every row group**: \`groupDefaultExpanded: -1\` (0 = none, N = that
  many levels). It is a DEFAULT, so it keeps applying to groups that appear
  later — which is what you want on a streaming blotter. To open specific
  groups instead, use set_group_expansion.
- **Pivot mode**: \`pivotMode\` is mirrored here by set_row_grouping so the
  drawer and the grid agree. Prefer set_row_grouping over setting it directly.

${sections}
`;
}
