import { describe, expect, it } from 'vitest';
import { columnTemplatesModule, COLUMN_TEMPLATES_MODULE_ID } from './index';

describe('columnTemplatesModule', () => {
  it('registers before column-customization', () => {
    expect(columnTemplatesModule.id).toBe(COLUMN_TEMPLATES_MODULE_ID);
    expect(columnTemplatesModule.priority).toBe(5);
  });

  it('getInitialState returns mutable empty maps', () => {
    const a = columnTemplatesModule.getInitialState();
    const b = columnTemplatesModule.getInitialState();
    a.templates.demo = { id: 'demo', label: 'Demo' } as never;
    expect(b.templates.demo).toBeUndefined();
  });

  it('serialize returns state unchanged', () => {
    const state = {
      templates: { t1: { id: 't1', label: 'T1' } as never },
      typeDefaults: { number: 't1' },
    };
    expect(columnTemplatesModule.serialize!(state)).toBe(state);
  });

  it('deserialize migrates legacy flat style overrides', () => {
    const raw = {
      templates: {
        t1: {
          id: 't1',
          label: 'T1',
          cellStyleOverrides: { color: 'red' },
        },
      },
      typeDefaults: { number: 't1' },
    };
    const state = columnTemplatesModule.deserialize!(raw);
    const cell = state.templates.t1?.cellStyleOverrides as { dark?: { color?: string }; light?: { color?: string } };
    expect(cell?.dark?.color).toBe('red');
    expect(cell?.light?.color).toBe('red');
  });

  it('deserialize returns empty state for invalid payload', () => {
    expect(columnTemplatesModule.deserialize!(null)).toEqual({ templates: {}, typeDefaults: {} });
    expect(columnTemplatesModule.deserialize!('bad')).toEqual({ templates: {}, typeDefaults: {} });
  });

  it('deserialize migrates header style overrides and skips missing templates', () => {
    const raw = {
      templates: {
        t1: {
          id: 't1',
          label: 'T1',
          headerStyleOverrides: { fontWeight: 'bold' },
        },
        t2: null,
      },
      typeDefaults: ['not-an-object'],
    };
    const state = columnTemplatesModule.deserialize!(raw);
    const hdr = state.templates.t1?.headerStyleOverrides as { dark?: { fontWeight?: string } };
    expect(hdr?.dark?.fontWeight).toBe('bold');
    expect(state.typeDefaults).toEqual({});
  });
});
