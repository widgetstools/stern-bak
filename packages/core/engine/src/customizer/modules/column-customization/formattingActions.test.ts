import { describe, expect, it } from 'vitest';
import {
  applyAlignmentReducer,
  applyBordersReducer,
  applyCellEditorKindReducer,
  applyCellEditorValuesReducer,
  applyColorsReducer,
  applyEditableReducer,
  applyFilterPrimaryKindReducer,
  applyFloatingFilterReducer,
  applyFormatterReducer,
  applyHeaderNameReducer,
  applyTemplateToColumnsReducer,
  applyTypographyReducer,
  clearAllBordersReducer,
  clearAllStylesInProfileReducer,
  clearAllStylesReducer,
  globalKey,
  mergeOverrides,
  overrideKey,
  removeTemplateRefFromAssignmentsReducer,
  stripUndefined,
  writeOverridesReducer,
} from './formattingActions';
import type { ColumnCustomizationState } from './state';

describe('formattingActions helpers', () => {
  it('maps override and global keys', () => {
    expect(overrideKey('cell')).toBe('cellStyleOverrides');
    expect(overrideKey('header')).toBe('headerStyleOverrides');
    expect(globalKey('cell')).toBe('globalCellStyle');
  });

  it('stripUndefined and mergeOverrides clear empty leaves', () => {
    expect(stripUndefined({ a: 1, b: undefined })).toEqual({ a: 1 });
    expect(
      mergeOverrides({ colors: { text: '#000' } }, { colors: { text: undefined } }),
    ).toBeUndefined();
  });
});

describe('writeOverridesReducer', () => {
  it('no-ops on empty colIds for selected scope', () => {
    const prev: ColumnCustomizationState = { assignments: {} };
    const next = writeOverridesReducer([], 'cell', { colors: { text: 'red' } })(prev);
    expect(next).toBe(prev);
  });

  it('writes global baselines for all scope', () => {
    const next = applyTypographyReducer([], 'cell', { bold: true }, 'all')(undefined);
    expect(next.globalCellStyle?.dark?.typography?.bold).toBe(true);
  });

  it('merges per-column themed overrides', () => {
    const next = applyColorsReducer(['price'], 'cell', { text: '#f00' })(undefined);
    expect(next.assignments.price.cellStyleOverrides?.dark?.colors?.text).toBe('#f00');
  });

  it('clears borders through clearAllBordersReducer', () => {
    const prev: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: {
            dark: { borders: { top: { width: 1, style: 'solid', color: '#000' } } },
          },
        },
      },
    };
    const next = clearAllBordersReducer(['price'], 'cell')(prev);
    expect(next.assignments.price.cellStyleOverrides).toBeUndefined();
  });
});

describe('structural reducers', () => {
  it('sets header names and editable flags', () => {
    let state = applyHeaderNameReducer(['a'], '  Bid  ')(undefined);
    expect(state.assignments.a.headerName).toBe('Bid');
    state = applyEditableReducer(['a'], true)(state);
    expect(state.assignments.a.editable).toBe(true);
  });

  it('sets cell editor kind and values', () => {
    let state = applyCellEditorKindReducer(['a'], 'agSelectCellEditor')(undefined);
    expect(state.assignments.a.cellEditor?.kind).toBe('agSelectCellEditor');
    expect(state.assignments.a.editable).toBe(true);
    state = applyCellEditorValuesReducer(['a'], { values: ['A', 'B'] })(state);
    expect(state.assignments.a.cellEditor?.values).toEqual(['A', 'B']);
  });

  it('writes filter and floating-filter config', () => {
    let state = applyFilterPrimaryKindReducer(['a'], 'streamSafeMultiColumnFilter')(undefined);
    expect(state.assignments.a.filter?.kind).toBe('streamSafeMultiColumnFilter');
    state = applyFloatingFilterReducer(['a'], true)(state);
    expect(state.assignments.a.filter?.floatingFilter).toBe(true);
  });
});

describe('formatter and template reducers', () => {
  it('writes global and per-column formatters', () => {
    const template = { kind: 'preset' as const, preset: 'number' as const };
    expect(
      applyFormatterReducer([], template, 'all', 'date')(undefined).globalCellDateFormatter,
    ).toEqual(template);
    const next = applyFormatterReducer(['price'], template)(undefined);
    expect(next.assignments.price.valueFormatterTemplate).toEqual(template);
  });

  it('clears renderer when setting a template', () => {
    const prev: ColumnCustomizationState = {
      assignments: {
        price: { colId: 'price', cellRendererId: 'opaque', cellRendererConfig: { kind: 'x' } },
      },
    };
    const next = applyFormatterReducer(
      ['price'],
      { kind: 'preset', preset: 'number' },
    )(prev);
    expect(next.assignments.price.cellRendererId).toBeUndefined();
  });

  it('applies and removes template references', () => {
    let state = applyTemplateToColumnsReducer(['a'], 'tpl-1')(undefined);
    expect(state.assignments.a.templateIds).toEqual(['tpl-1']);
    state = removeTemplateRefFromAssignmentsReducer('tpl-1')(state);
    expect(state.assignments.a.templateIds).toBeUndefined();
  });
});

describe('clear reducers', () => {
  it('clears selected columns and whole profile assignments', () => {
    const prev: ColumnCustomizationState = {
      assignments: { a: { colId: 'a', headerName: 'A' }, b: { colId: 'b' } },
    };
    expect(clearAllStylesReducer(['a'])(prev).assignments.a).toEqual({ colId: 'a' });
    expect(clearAllStylesInProfileReducer()(prev).assignments).toEqual({});
    expect(clearAllStylesInProfileReducer()(undefined)).toEqual({ assignments: {} });
  });
});
