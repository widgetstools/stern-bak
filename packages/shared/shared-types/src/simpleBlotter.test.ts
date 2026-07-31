import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_ACTIONS,
  createDefaultBlotterConfig,
  createDefaultLayoutConfig,
} from './simpleBlotter.js';

describe('BUILT_IN_ACTIONS', () => {
  it('pins the action ids toolbar buttons dispatch on', () => {
    // Toolbar configs persist these ids; renaming one turns every saved
    // custom button into a dead no-op.
    expect(BUILT_IN_ACTIONS).toEqual({
      REFRESH: 'grid:refresh',
      EXPORT_CSV: 'grid:exportCsv',
      EXPORT_EXCEL: 'grid:exportExcel',
      RESET_COLUMNS: 'grid:resetColumns',
      RESET_FILTERS: 'grid:resetFilters',
      AUTO_SIZE_COLUMNS: 'grid:autoSizeColumns',
      SELECT_ALL: 'selection:all',
      DESELECT_ALL: 'selection:none',
      COPY_SELECTED: 'selection:copy',
      COLUMN_CHOOSER: 'dialog:columnChooser',
      ADVANCED_FILTERS: 'dialog:advancedFilters',
      SETTINGS: 'dialog:settings',
    });
  });

  it('has no duplicate ids — a collision would fire two handlers', () => {
    const ids = Object.values(BUILT_IN_ACTIONS);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('createDefaultBlotterConfig', () => {
  it('produces a fully-populated config with every toolbar affordance on', () => {
    const cfg = createDefaultBlotterConfig();
    expect(cfg).toEqual({
      dataProviderId: '',
      defaultLayoutId: undefined,
      toolbar: {
        showLayoutSelector: true,
        showExportButton: true,
        showFilterBar: true,
        showColumnChooser: true,
        showRefreshButton: true,
        showSettingsButton: true,
        customButtons: [],
      },
      themeMode: 'system',
      title: 'Simple Blotter',
      autoRefreshInterval: 0,
      enableRealTimeUpdates: true,
      conditionalFormattingRules: [],
      editingRules: [],
      columnGroups: [],
      valueFormatters: [],
      calculatedColumns: [],
    });
  });

  it('lets overrides win, including falsy ones', () => {
    const cfg = createDefaultBlotterConfig({
      dataProviderId: 'p1',
      title: '',
      enableRealTimeUpdates: false,
      themeMode: 'dark',
    });
    expect(cfg.dataProviderId).toBe('p1');
    expect(cfg.title).toBe('');
    expect(cfg.enableRealTimeUpdates).toBe(false);
    expect(cfg.themeMode).toBe('dark');
  });

  it('replaces the toolbar wholesale rather than merging it', () => {
    // The spread is shallow — a partial toolbar override DROPS the
    // unspecified flags, so callers must pass a complete toolbar.
    const cfg = createDefaultBlotterConfig({
      toolbar: { showRefreshButton: false } as never,
    });
    expect(cfg.toolbar).toEqual({ showRefreshButton: false });
  });

  it('gives each call its own array instances', () => {
    const a = createDefaultBlotterConfig();
    const b = createDefaultBlotterConfig();
    a.editingRules.push({} as never);
    expect(b.editingRules).toEqual([]);
    expect(a.toolbar).not.toBe(b.toolbar);
  });
});

describe('createDefaultLayoutConfig', () => {
  it('produces an empty layout with the side bar hidden', () => {
    const layout = createDefaultLayoutConfig();
    expect(layout).toEqual({
      columnDefs: [],
      columnState: [],
      filterState: {},
      sortState: [],
      activeFormattingRuleIds: [],
      activeEditingRuleIds: [],
      activeColumnGroupIds: [],
      activeFormatterIds: [],
      activeCalculatedColumnIds: [],
      rowHeight: undefined,
      headerHeight: undefined,
      pinnedColumns: undefined,
      rowGroupColumns: [],
      pivotColumns: [],
      sideBarState: { visible: false, openToolPanel: null },
    });
  });

  it('lets overrides win', () => {
    const layout = createDefaultLayoutConfig({
      rowHeight: 32,
      sortState: [{ colId: 'px', sort: 'asc' }] as never,
      sideBarState: { visible: true, position: 'right', openToolPanel: 'columns' },
    });
    expect(layout.rowHeight).toBe(32);
    expect(layout.sortState).toHaveLength(1);
    expect(layout.sideBarState).toEqual({
      visible: true,
      position: 'right',
      openToolPanel: 'columns',
    });
  });

  it('gives each call its own array instances', () => {
    const a = createDefaultLayoutConfig();
    const b = createDefaultLayoutConfig();
    a.columnDefs.push({ field: 'px' });
    expect(b.columnDefs).toEqual([]);
  });
});
