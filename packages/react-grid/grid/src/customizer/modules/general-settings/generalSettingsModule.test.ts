import { describe, expect, it, vi } from 'vitest';
import type { TransformContext } from '@wellsfargo-starui/core';
import { generalSettingsModule } from './index';
import { INITIAL_GENERAL_SETTINGS } from '@wellsfargo-starui/core';
import {
  buildCellChangeFlashCss,
  CELL_CHANGE_FLASH_CSS_HANDLE,
  CELL_CHANGE_FLASH_CSS_RULE_ID,
} from './cellChangeFlashCss';

describe('generalSettingsModule cell-change flash wiring', () => {
  it('defines NO transformColumnDefs — flash rides defaultColDef so colDef identity is preserved', () => {
    // A per-colDef spread here would clone every colDef on every
    // transform pass (this module runs first), breaking identity for
    // the whole pipeline and re-triggering AG-Grid column-state
    // reconciliation. Guard against it coming back.
    expect(generalSettingsModule.transformColumnDefs).toBeUndefined();
  });

  it('includes enableCellChangeFlash in defaultColDef from transformGridOptions', () => {
    const ctx = makeCtx();
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, enableCellChangeFlash: true },
      ctx,
    );
    expect(opts.defaultColDef?.enableCellChangeFlash).toBe(true);

    const off = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, enableCellChangeFlash: false },
      makeCtx(),
    );
    expect(off.defaultColDef?.enableCellChangeFlash).toBe(false);
  });
});

describe('generalSettingsModule.transformGridOptions update-rate cap', () => {
  const ctx = makeCtx();

  it('maps the default 5/sec cap to a 200 ms async-transaction window', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS },
      ctx,
    );
    // 5/sec default: at 20k rows each flush costs 60-170ms of main
    // thread, so 8/sec starved interactions (~70% busy); 5/sec keeps
    // the blotter live while leaving room for the UI.
    expect(INITIAL_GENERAL_SETTINGS.maxGridUpdatesPerSecond).toBe(5);
    expect(opts.asyncTransactionWaitMillis).toBe(200);
  });

  it('maps 0 (uncapped) to a 0 ms window — flush ASAP', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, maxGridUpdatesPerSecond: 0 },
      ctx,
    );
    expect(opts.asyncTransactionWaitMillis).toBe(0);
  });

  it('rounds arbitrary rates to the nearest millisecond window', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, maxGridUpdatesPerSecond: 3 },
      ctx,
    );
    expect(opts.asyncTransactionWaitMillis).toBe(333);
  });
});

describe('generalSettingsModule.transformGridOptions rowSelection', () => {
  const ctx = makeCtx();

  it('omits rowSelection when mode is off', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, rowSelection: undefined },
      ctx,
    );
    expect(opts.rowSelection).toBeUndefined();
    expect(opts.selectionColumnDef).toBeUndefined();
  });

  it('enables checkboxes and selectionColumnDef when checkbox selection is on', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        rowSelection: 'multiRow',
        checkboxSelection: true,
      },
      ctx,
    );
    expect(opts.rowSelection).toEqual({
      mode: 'multiRow',
      checkboxes: true,
      headerCheckbox: true,
    });
    expect(opts.selectionColumnDef).toEqual({
      suppressMovable: false,
      lockPosition: false,
      pinned: 'left',
    });
  });

  it('removes row and header checkboxes when checkbox selection is off', () => {
    const multi = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        rowSelection: 'multiRow',
        checkboxSelection: false,
      },
      ctx,
    );
    expect(multi.rowSelection).toEqual({
      mode: 'multiRow',
      checkboxes: false,
      headerCheckbox: false,
      enableClickSelection: true,
    });
    expect(multi.selectionColumnDef).toBeUndefined();

    const single = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        rowSelection: 'singleRow',
        checkboxSelection: false,
      },
      ctx,
    );
    expect(single.rowSelection).toEqual({
      mode: 'singleRow',
      checkboxes: false,
      headerCheckbox: false,
      enableClickSelection: true,
    });
  });
});

describe('generalSettingsModule cell change flash CSS', () => {
  it('injects scoped flash colour CSS when flash-on-change is enabled', () => {
    const addRule = vi.fn();
    const removeRule = vi.fn();
    const ctx = makeCtx({ addRule, removeRule });

    generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        enableCellChangeFlash: true,
        cellChangeFlashColor: 'rose',
      },
      ctx,
    );

    expect(addRule).toHaveBeenCalledWith(
      CELL_CHANGE_FLASH_CSS_RULE_ID,
      buildCellChangeFlashCss('test-grid', 'rose'),
    );
    expect(removeRule).not.toHaveBeenCalled();
  });

  it('removes flash colour CSS when flash-on-change is disabled', () => {
    const addRule = vi.fn();
    const removeRule = vi.fn();
    const ctx = makeCtx({ addRule, removeRule });

    generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, enableCellChangeFlash: false },
      ctx,
    );

    expect(removeRule).toHaveBeenCalledWith(CELL_CHANGE_FLASH_CSS_RULE_ID);
    expect(addRule).not.toHaveBeenCalled();
  });
});

function makeCtx(
  css: Partial<{ addRule: ReturnType<typeof vi.fn>; removeRule: ReturnType<typeof vi.fn> }> = {},
): TransformContext {
  return {
    gridId: 'test-grid',
    getRowId: () => '',
    getModuleState: () => undefined,
    api: null,
    resources: {
      css: () => ({
        addRule: css.addRule ?? vi.fn(),
        removeRule: css.removeRule ?? vi.fn(),
        clear: vi.fn(),
      }),
    },
  } as TransformContext;
}

function makeCtxWithCssTracking(): {
  ctx: TransformContext;
  addRule: ReturnType<typeof vi.fn>;
  removeRule: ReturnType<typeof vi.fn>;
} {
  const addRule = vi.fn();
  const removeRule = vi.fn();
  return {
    ctx: makeCtx({ addRule, removeRule }),
    addRule,
    removeRule,
  };
}

// Ensure css handle key stays stable for ResourceScope lookups.
describe('CELL_CHANGE_FLASH_CSS_HANDLE', () => {
  it('matches the injector module id used in transformGridOptions', () => {
    const { ctx, addRule } = makeCtxWithCssTracking();
    const cssSpy = vi.spyOn(ctx.resources, 'css');
    generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, enableCellChangeFlash: true },
      ctx,
    );
    expect(cssSpy).toHaveBeenCalledWith(CELL_CHANGE_FLASH_CSS_HANDLE);
    expect(addRule).toHaveBeenCalled();
  });
});

describe('generalSettingsModule migrate/deserialize', () => {
  it('migrate returns defaults for null and non-object payloads', () => {
    expect(generalSettingsModule.migrate!(null)).toEqual(INITIAL_GENERAL_SETTINGS);
    expect(generalSettingsModule.migrate!('bad')).toEqual(INITIAL_GENERAL_SETTINGS);
  });

  it('deserialize overlays stored values onto defaults', () => {
    expect(generalSettingsModule.deserialize!({ rowHeight: 40 })).toMatchObject({
      rowHeight: 40,
      enableCellChangeFlash: INITIAL_GENERAL_SETTINGS.enableCellChangeFlash,
    });
  });
});

describe('generalSettingsModule.transformGridOptions multi-sort and enter-nav', () => {
  const ctx = makeCtx();

  it.each([
    ['replace', { suppressMultiSort: true, alwaysMultiSort: false, multiSortKey: undefined }],
    ['shift', { suppressMultiSort: false, alwaysMultiSort: false, multiSortKey: undefined }],
    ['ctrl', { suppressMultiSort: false, alwaysMultiSort: false, multiSortKey: 'ctrl' }],
    ['always', { suppressMultiSort: false, alwaysMultiSort: true, multiSortKey: undefined }],
  ] as const)('maps multiSortMode %s', (mode, expected) => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, multiSortMode: mode },
      ctx,
    );
    expect(opts).toMatchObject(expected);
  });

  it.each([
    ['default', { enterNavigatesVertically: false, enterNavigatesVerticallyAfterEdit: false }],
    ['always', { enterNavigatesVertically: true, enterNavigatesVerticallyAfterEdit: false }],
    ['afterEdit', { enterNavigatesVertically: false, enterNavigatesVerticallyAfterEdit: true }],
    ['both', { enterNavigatesVertically: true, enterNavigatesVerticallyAfterEdit: true }],
  ] as const)('maps enterNavigation %s', (mode, expected) => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, enterNavigation: mode },
      ctx,
    );
    expect(opts).toMatchObject(expected);
  });
});

describe('generalSettingsModule.transformGridOptions sidebar and status bar', () => {
  const ctx = makeCtx();

  it('emits sideBar false when disabled or no panels enabled', () => {
    const off = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, sideBar: false },
      ctx,
    );
    expect(off.sideBar).toBe(false);

    const emptyPanels = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        sideBar: true,
        sideBarShowColumns: false,
        sideBarShowFilters: false,
      },
      ctx,
    );
    expect(emptyPanels.sideBar).toBe(false);
  });

  it('builds sideBar toolPanels and honours default panel when enabled', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        sideBar: true,
        sideBarShowColumns: true,
        sideBarShowFilters: true,
        sideBarDefaultPanel: 'filters',
      },
      ctx,
    );
    expect(opts.sideBar).toMatchObject({
      defaultToolPanel: 'filters',
      toolPanels: expect.arrayContaining([
        expect.objectContaining({ id: 'columns' }),
        expect.objectContaining({ id: 'filters' }),
      ]),
    });
  });

  it('omits defaultToolPanel when default panel is disabled', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        sideBar: true,
        sideBarShowColumns: true,
        sideBarShowFilters: false,
        sideBarDefaultPanel: 'filters',
      },
      ctx,
    );
    expect((opts.sideBar as { defaultToolPanel?: string }).defaultToolPanel).toBeUndefined();
  });

  it('omits statusBar when disabled or no panels', () => {
    const off = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, statusBar: false },
      ctx,
    );
    expect(off.statusBar).toBeUndefined();

    const empty = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        statusBar: true,
        statusBarShowTotalAndFilteredCount: false,
        statusBarShowFilteredCount: false,
        statusBarShowTotalCount: false,
        statusBarShowSelectedCount: false,
        statusBarShowAggregation: false,
      },
      ctx,
    );
    expect(empty.statusBar).toBeUndefined();
  });

  it('builds statusBar panels when enabled', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        statusBar: true,
        statusBarShowTotalAndFilteredCount: false,
        statusBarShowFilteredCount: false,
        statusBarShowSelectedCount: false,
        statusBarShowTotalCount: true,
        statusBarShowAggregation: true,
      },
      ctx,
    );
    expect(opts.statusBar?.statusPanels).toEqual([
      { statusPanel: 'agTotalRowCountComponent' },
      { statusPanel: 'agAggregationComponent', align: 'right' },
    ]);
  });
});

describe('generalSettingsModule.transformGridOptions misc branches', () => {
  const ctx = makeCtx();

  it('singleRow checkbox selection omits headerCheckbox', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      {
        ...INITIAL_GENERAL_SETTINGS,
        rowSelection: 'singleRow',
        checkboxSelection: true,
      },
      ctx,
    );
    expect(opts.rowSelection).toEqual({ mode: 'singleRow', checkboxes: true });
    expect((opts.rowSelection as { headerCheckbox?: boolean }).headerCheckbox).toBeUndefined();
  });

  it('clears pagination child options when pagination is off', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, pagination: false },
      ctx,
    );
    expect(opts.paginationPageSize).toBeUndefined();
    expect(opts.paginationAutoPageSize).toBeUndefined();
  });

  it('omits undoRedoCellEditingLimit when undo/redo disabled', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, undoRedoCellEditing: false },
      ctx,
    );
    expect(opts.undoRedoCellEditingLimit).toBeUndefined();
  });

  it('installs tooltipValueGetter when showCellTooltips is on', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, showCellTooltips: true },
      ctx,
    );
    const getter = opts.defaultColDef?.tooltipValueGetter as
      | ((p: { value: unknown }) => string | null)
      | undefined;
    expect(getter?.({ value: 'hello' })).toBe('hello');
    expect(getter?.({ value: null })).toBeNull();
    expect(getter?.({ value: '' })).toBeNull();
  });

  it('clears quickFilterText when empty string', () => {
    const opts = generalSettingsModule.transformGridOptions!(
      {},
      { ...INITIAL_GENERAL_SETTINGS, quickFilterText: '' },
      ctx,
    );
    expect(opts.quickFilterText).toBeUndefined();
  });
});
