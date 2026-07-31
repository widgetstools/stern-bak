import { describe, expect, it, vi } from 'vitest';
import type { TransformContext } from '@wellsfargo-starui/engine';
import { generalSettingsModule } from './index';
import { INITIAL_GENERAL_SETTINGS } from './state';
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
