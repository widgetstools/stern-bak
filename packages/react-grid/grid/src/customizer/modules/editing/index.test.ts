import { describe, expect, it } from 'vitest';
import { INITIAL_EDITING } from '@wellsfargo-starui/core';
import { editingModule } from './index.js';

describe('editingModule', () => {
  it('declares the merged id, panel, and the four legacy ids', () => {
    expect(editingModule.id).toBe('editing');
    expect(editingModule.schemaVersion).toBe(1);
    expect(editingModule.legacyIds).toEqual([
      'smart-edit',
      'bulk-update',
      'plus-minus',
      'shortcuts',
    ]);
    expect(editingModule.migrateLegacy).toBeTypeOf('function');
    expect(editingModule.SettingsPanel).toBeTruthy();
    expect(editingModule.ListPane).toBeUndefined();
  });

  it('serialize/deserialize round-trips all four slices', () => {
    const state = structuredClone(INITIAL_EDITING);
    state.smartEdit.settings.incrementStep = 7;
    state.shortcuts.shortcuts = [
      {
        id: 's1',
        name: 'Double',
        enabled: true,
        shortcutKey: 'd',
        operation: 'multiply',
        shortcutValue: 2,
        scope: { columnIds: [] },
      },
    ];
    const round = editingModule.deserialize(editingModule.serialize(state));
    expect(round).toEqual(state);
  });

  it('migrateLegacy assembles state from pre-merge envelopes', () => {
    const state = editingModule.migrateLegacy!({
      'smart-edit': { v: 2, data: { settings: { enabled: false } } },
      'plus-minus': {
        v: 1,
        data: {
          settings: { enabled: true, recordHistory: false },
          nudges: [
            { id: 'n1', name: 'Bump', enabled: true, scope: { columnIds: [] }, incrementStep: 1 },
          ],
        },
      },
    });
    expect(state.smartEdit.settings.enabled).toBe(false);
    expect(state.plusMinus.nudges).toHaveLength(1);
    expect(state.bulkUpdate).toEqual(INITIAL_EDITING.bulkUpdate);
  });

  it('composes the three colDef transforms behind the slice switches', () => {
    const defs = [{ colId: 'qty', field: 'qty', cellDataType: 'number', editable: true }];
    const allOff = structuredClone(INITIAL_EDITING);
    allOff.smartEdit.settings.enabled = false;
    allOff.plusMinus.settings.enabled = false;
    allOff.shortcuts.settings.enabled = false;
    expect(editingModule.transformColumnDefs!(defs, allOff, {} as never)).toBe(defs);

    const on = structuredClone(INITIAL_EDITING);
    const out = editingModule.transformColumnDefs!(defs, on, {} as never);
    expect(out).not.toBe(defs);
  });
});
