import { describe, expect, it } from 'vitest';
import {
  deserializeEditingState,
  INITIAL_EDITING,
  LEGACY_EDITING_MODULE_IDS,
  migrateLegacyEditingState,
} from './state';
import { INITIAL_SMART_EDIT } from '../smart-edit/state';

describe('editing state', () => {
  it('deserializes garbage to the initial state', () => {
    expect(deserializeEditingState(null)).toEqual(INITIAL_EDITING);
    expect(deserializeEditingState('nope')).toEqual(INITIAL_EDITING);
    expect(deserializeEditingState({})).toEqual(INITIAL_EDITING);
  });

  it('round-trips a merged payload through the family deserializers', () => {
    const state = deserializeEditingState({
      smartEdit: { settings: { enabled: false, incrementStep: 5 } },
      shortcuts: {
        settings: { enabled: true, recordHistory: false },
        shortcuts: [
          {
            id: 's1',
            name: 'Double',
            enabled: true,
            shortcutKey: 'd',
            operation: 'multiply',
            shortcutValue: 2,
            scope: { columnIds: [] },
          },
        ],
      },
    });
    expect(state.smartEdit.settings.enabled).toBe(false);
    expect(state.smartEdit.settings.incrementStep).toBe(5);
    expect(state.shortcuts.shortcuts).toHaveLength(1);
    // absent slices fall back to their initial state
    expect(state.bulkUpdate).toEqual(INITIAL_EDITING.bulkUpdate);
    expect(state.plusMinus).toEqual(INITIAL_EDITING.plusMinus);
  });

  it('lists the four absorbed module ids', () => {
    expect(LEGACY_EDITING_MODULE_IDS).toEqual([
      'smart-edit',
      'bulk-update',
      'plus-minus',
      'shortcuts',
    ]);
  });
});

describe('migrateLegacyEditingState', () => {
  it('assembles state from enveloped legacy payloads', () => {
    const state = migrateLegacyEditingState({
      'smart-edit': { v: 2, data: { settings: { enabled: false } } },
      'bulk-update': { v: 1, data: { settings: { confirmThreshold: 5 } } },
      'plus-minus': {
        v: 1,
        data: {
          settings: { enabled: true, recordHistory: true },
          nudges: [
            { id: 'n1', name: 'Bump', enabled: true, scope: { columnIds: ['px'] }, incrementStep: 0.5 },
          ],
        },
      },
    });
    expect(state.smartEdit.settings.enabled).toBe(false);
    expect(state.bulkUpdate.settings.confirmThreshold).toBe(5);
    expect(state.plusMinus.nudges).toHaveLength(1);
    expect(state.shortcuts).toEqual(INITIAL_EDITING.shortcuts);
  });

  it('is version-tolerant: a smart-edit envelope stamped v1 still loads', () => {
    // The lab profile generator wrote v1 for every module while smart-edit
    // was v2 — the old per-module load path dropped those payloads. The
    // merged migration accepts them.
    const state = migrateLegacyEditingState({
      'smart-edit': { v: 1, data: { settings: { enabled: false, previewBeforeApply: true } } },
    });
    expect(state.smartEdit.settings.enabled).toBe(false);
    expect(state.smartEdit.settings.previewBeforeApply).toBe(true);
  });

  it('accepts bare (non-enveloped) legacy values', () => {
    const state = migrateLegacyEditingState({
      'smart-edit': { settings: { incrementStep: 3 } },
    });
    expect(state.smartEdit.settings.incrementStep).toBe(3);
  });

  it('drops malformed sub-payloads to their defaults instead of throwing', () => {
    const state = migrateLegacyEditingState({
      'smart-edit': { v: 2, data: 42 },
      'shortcuts': { v: 1, data: { shortcuts: [{ shortcutKey: '!!' }] } },
    });
    expect(state.smartEdit).toEqual(INITIAL_SMART_EDIT);
    expect(state.shortcuts.shortcuts).toEqual([]);
  });
});
