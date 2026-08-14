import { describe, expect, it } from 'vitest';
import { INITIAL_COLUMN_CUSTOMIZATION } from '@wellsfargo-starui/core';
import { columnCustomizationModule, COLUMN_CUSTOMIZATION_MODULE_ID } from './index';
import { COLUMN_TEMPLATES_MODULE_ID } from '../column-templates';

describe('columnCustomizationModule', () => {
  it('registers with expected metadata', () => {
    expect(columnCustomizationModule.id).toBe(COLUMN_CUSTOMIZATION_MODULE_ID);
    expect(columnCustomizationModule.code).toBe('04');
    expect(columnCustomizationModule.priority).toBe(10);
    expect(columnCustomizationModule.dependencies).toContain(COLUMN_TEMPLATES_MODULE_ID);
    expect(columnCustomizationModule.SettingsPanel).toBeTruthy();
    expect(columnCustomizationModule.ListPane).toBeTruthy();
    expect(columnCustomizationModule.EditorPane).toBeTruthy();
  });

  it('getInitialState returns a clone of INITIAL_COLUMN_CUSTOMIZATION', () => {
    const state = columnCustomizationModule.getInitialState();
    expect(state).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
    expect(state).not.toBe(INITIAL_COLUMN_CUSTOMIZATION);
  });

  it('serialize / deserialize round-trip', () => {
    const state = columnCustomizationModule.getInitialState();
    const raw = columnCustomizationModule.serialize!(state);
    const restored = columnCustomizationModule.deserialize!(raw);
    expect(restored).toEqual(state);
  });

  it('migrate lifts v8 globalCellFormatter into number slot', () => {
    const migrated = columnCustomizationModule.migrate!(
      {
        assignments: {},
        globalCellFormatter: { kind: 'preset', preset: 'currency' },
      },
      8,
    );
    expect(migrated.globalCellNumberFormatter).toEqual({ kind: 'preset', preset: 'currency' });
    expect(migrated.globalCellFormatter).toBeUndefined();
  });

  it('transformColumnDefs is no-op without assignments or globals', () => {
    const defs = [{ field: 'qty' }];
    const out = columnCustomizationModule.transformColumnDefs!(defs, INITIAL_COLUMN_CUSTOMIZATION, {
      getModuleState: () => ({ templates: {} }),
      resources: {
        css: () => ({ setText: () => {}, clear: () => {} }),
        expression: () => ({}),
        appData: () => undefined,
      },
    } as never);
    expect(out).toBe(defs);
  });

  it('transformColumnDefs applies assignments when present', () => {
    const defs = [{ field: 'qty', colId: 'qty' }];
    const state = {
      ...INITIAL_COLUMN_CUSTOMIZATION,
      assignments: {
        qty: { colId: 'qty', headerName: 'Quantity' },
      },
    };
    const cssHandle = { setText: vi.fn(), clear: vi.fn() };
    const out = columnCustomizationModule.transformColumnDefs!(defs, state, {
      getModuleState: () => ({ templates: {} }),
      resources: {
        css: () => cssHandle,
        expression: () => ({}),
        appData: () => undefined,
      },
    } as never);
    expect(out).not.toBe(defs);
    expect(out[0]?.headerName).toBe('Quantity');
    expect(cssHandle.clear).toHaveBeenCalled();
  });

  it('migrate rewrites v6 stream-safe filter kinds', () => {
    const migrated = columnCustomizationModule.migrate!(
      {
        assignments: {
          sym: {
            filter: { kind: 'streamSafeMultiColumnFilter', floatingFilterStyle: 'x' },
          },
        },
      },
      6,
    );
    expect(migrated.assignments.sym?.filter?.kind).toBe('agMultiColumnFilter');
    expect(migrated.assignments.sym?.filter).not.toHaveProperty('floatingFilterStyle');
  });

  it('migrate falls back on malformed snapshot', () => {
    const migrated = columnCustomizationModule.migrate!(null, 5);
    expect(migrated).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
  });

  it('deserialize strips stale templates field and lifts themed styles', () => {
    const restored = columnCustomizationModule.deserialize!({
      templates: { old: true },
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: { dark: { color: '#fff' }, light: { color: '#000' } },
        },
      },
    });
    expect(restored).not.toHaveProperty('templates');
    expect(restored.assignments.price?.cellStyleOverrides).toBeTruthy();
  });
});
