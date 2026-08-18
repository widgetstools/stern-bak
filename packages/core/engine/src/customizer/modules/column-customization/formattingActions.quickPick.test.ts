/**
 * The formatter toolbar's quick-pick writers: header name, editable, cell
 * editor, filter, floating filter, formatter, and the template chain.
 *
 * `formattingActions.test.ts` covers the style-override writers and
 * `applyAutoFormatPlan.test.ts` the auto-format plan; these are the rest.
 * Every reducer here shares one shape — `(…args) => (prev) => next` — so the
 * cases that repeat per reducer are the two structural rules: an empty column
 * list is a no-op, and a missing prior state starts from `{ assignments: {} }`.
 */
import { describe, expect, it } from 'vitest';
import type { ColumnCustomizationState } from './state';
import {
  applyCellEditorKindReducer,
  applyCellEditorValuesReducer,
  applyEditableReducer,
  applyFilterPrimaryKindReducer,
  applyFloatingFilterReducer,
  applyFormatterReducer,
  applyHeaderNameReducer,
  applyTemplateToColumnsReducer,
  clearAllStylesReducer,
  removeTemplateRefFromAssignmentsReducer,
} from './formattingActions';

const state = (assignments: ColumnCustomizationState['assignments'] = {}) =>
  ({ assignments }) as ColumnCustomizationState;

describe('applyHeaderNameReducer', () => {
  it('sets the caption on every listed column', () => {
    const next = applyHeaderNameReducer(['a', 'b'], 'Symbol')(state());
    expect(next.assignments.a).toMatchObject({ colId: 'a', headerName: 'Symbol' });
    expect(next.assignments.b).toMatchObject({ colId: 'b', headerName: 'Symbol' });
  });

  it('trims the caption', () => {
    expect(applyHeaderNameReducer(['a'], '  Symbol  ')(state()).assignments.a).toMatchObject({
      headerName: 'Symbol',
    });
  });

  it('clears the caption for undefined, empty, or whitespace-only', () => {
    const prev = state({ a: { colId: 'a', headerName: 'Old' } });
    for (const value of [undefined, '', '   ']) {
      expect(applyHeaderNameReducer(['a'], value)(prev).assignments.a).not.toHaveProperty(
        'headerName',
      );
    }
  });

  it('keeps the rest of the assignment', () => {
    const prev = state({ a: { colId: 'a', editable: true } });
    expect(applyHeaderNameReducer(['a'], 'Symbol')(prev).assignments.a).toMatchObject({
      editable: true,
    });
  });

  it('does nothing for an empty column list', () => {
    const prev = state({ a: { colId: 'a' } });
    expect(applyHeaderNameReducer([], 'Symbol')(prev)).toBe(prev);
  });

  it('starts from an empty state when there is no prior one', () => {
    expect(applyHeaderNameReducer(['a'], 'Symbol')(undefined).assignments.a).toBeDefined();
  });
});

describe('applyEditableReducer', () => {
  it('sets the flag either way', () => {
    expect(applyEditableReducer(['a'], true)(state()).assignments.a).toMatchObject({
      editable: true,
    });
    expect(applyEditableReducer(['a'], false)(state()).assignments.a).toMatchObject({
      editable: false,
    });
  });

  it('clears the flag with undefined', () => {
    const prev = state({ a: { colId: 'a', editable: true } });
    expect(applyEditableReducer(['a'], undefined)(prev).assignments.a).not.toHaveProperty(
      'editable',
    );
  });

  it('does nothing for an empty column list', () => {
    const prev = state();
    expect(applyEditableReducer([], true)(prev)).toBe(prev);
  });

  it('starts from an empty state when there is no prior one', () => {
    expect(applyEditableReducer(['a'], true)(undefined).assignments.a).toBeDefined();
  });
});

describe('applyCellEditorKindReducer', () => {
  it('sets the kind and unlocks the cell', () => {
    // Picking an editor on a locked column is a silent no-op in AG Grid, so
    // the reducer flips `editable` for the user.
    const next = applyCellEditorKindReducer(['a'], 'select')(state());
    expect(next.assignments.a).toMatchObject({ cellEditor: { kind: 'select' }, editable: true });
  });

  it('overrides an editable:false the user had set', () => {
    const prev = state({ a: { colId: 'a', editable: false } });
    expect(applyCellEditorKindReducer(['a'], 'select')(prev).assignments.a).toMatchObject({
      editable: true,
    });
  });

  it('keeps existing editor tuning when only the kind changes', () => {
    const prev = state({
      a: { colId: 'a', cellEditor: { kind: 'select', values: ['x'], valuesSource: 'src' } },
    });
    expect(applyCellEditorKindReducer(['a'], 'richSelect')(prev).assignments.a?.cellEditor)
      .toMatchObject({ kind: 'richSelect', values: ['x'], valuesSource: 'src' });
  });

  it('removes the editor entirely for undefined', () => {
    const prev = state({ a: { colId: 'a', cellEditor: { kind: 'select' }, editable: true } });
    const next = applyCellEditorKindReducer(['a'], undefined)(prev).assignments.a;

    expect(next).not.toHaveProperty('cellEditor');
    // Editable is left alone so clearing the kind does not lock the column.
    expect(next).toMatchObject({ editable: true });
  });

  it('does nothing for an empty column list', () => {
    const prev = state();
    expect(applyCellEditorKindReducer([], 'select')(prev)).toBe(prev);
  });

  it('starts from an empty state when there is no prior one', () => {
    expect(applyCellEditorKindReducer(['a'], 'select')(undefined).assignments.a).toBeDefined();
  });
});

describe('applyCellEditorValuesReducer', () => {
  const withEditor = () => state({ a: { colId: 'a', cellEditor: { kind: 'select' } } });

  it('sets the values', () => {
    expect(
      applyCellEditorValuesReducer(['a'], { values: ['x', 'y'] })(withEditor()).assignments.a
        ?.cellEditor,
    ).toMatchObject({ values: ['x', 'y'] });
  });

  it('sets the values source', () => {
    expect(
      applyCellEditorValuesReducer(['a'], { valuesSource: 'regions' })(withEditor()).assignments.a
        ?.cellEditor,
    ).toMatchObject({ valuesSource: 'regions' });
  });

  it('clears one field while preserving the other', () => {
    const prev = state({
      a: { colId: 'a', cellEditor: { kind: 'select', values: ['x'], valuesSource: 'regions' } },
    });
    const editor = applyCellEditorValuesReducer(['a'], { values: undefined })(prev).assignments.a
      ?.cellEditor;

    expect(editor).not.toHaveProperty('values');
    expect(editor).toMatchObject({ valuesSource: 'regions' });
  });

  it('clears the values source while preserving the values', () => {
    const prev = state({
      a: { colId: 'a', cellEditor: { kind: 'select', values: ['x'], valuesSource: 'regions' } },
    });
    const editor = applyCellEditorValuesReducer(['a'], { valuesSource: undefined })(prev)
      .assignments.a?.cellEditor;

    expect(editor).not.toHaveProperty('valuesSource');
    expect(editor).toMatchObject({ values: ['x'] });
  });

  it('leaves an untouched field alone when the patch omits it', () => {
    const prev = state({
      a: { colId: 'a', cellEditor: { kind: 'select', valuesSource: 'regions' } },
    });
    expect(
      applyCellEditorValuesReducer(['a'], { values: ['x'] })(prev).assignments.a?.cellEditor,
    ).toMatchObject({ valuesSource: 'regions' });
  });

  it('skips a column with no editor to patch', () => {
    const prev = state({ a: { colId: 'a' } });
    expect(applyCellEditorValuesReducer(['a'], { values: ['x'] })(prev).assignments.a).toEqual({
      colId: 'a',
    });
  });

  it('skips a column that has no assignment at all', () => {
    expect(
      applyCellEditorValuesReducer(['missing'], { values: ['x'] })(state()).assignments.missing,
    ).toBeUndefined();
  });

  it('does nothing for an empty column list', () => {
    const prev = withEditor();
    expect(applyCellEditorValuesReducer([], { values: ['x'] })(prev)).toBe(prev);
  });

  it('starts from an empty state when there is no prior one', () => {
    expect(applyCellEditorValuesReducer(['a'], { values: ['x'] })(undefined).assignments).toEqual(
      {},
    );
  });
});

describe('applyFilterPrimaryKindReducer', () => {
  it('enables the picked filter kind', () => {
    expect(
      applyFilterPrimaryKindReducer(['a'], 'streamSafeMultiColumnFilter')(state()).assignments.a
        ?.filter,
    ).toMatchObject({ enabled: true, kind: 'streamSafeMultiColumnFilter' });
  });

  it('drops a prior multiFilters override', () => {
    // The streamSafe wrappers carry their own multi+set composition; a stale
    // override would force-cast the column back to a plain multi.
    const prev = state({
      a: { colId: 'a', filter: { enabled: true, multiFilters: [{ kind: 'text' }] } },
    });
    expect(
      applyFilterPrimaryKindReducer(['a'], 'streamSafeMultiColumnFilter')(prev).assignments.a
        ?.filter?.multiFilters,
    ).toBeUndefined();
  });

  it('preserves other filter settings', () => {
    const prev = state({ a: { colId: 'a', filter: { enabled: true, floatingFilter: true } } });
    expect(
      applyFilterPrimaryKindReducer(['a'], 'streamSafeMultiColumnFilter')(prev).assignments.a
        ?.filter,
    ).toMatchObject({ floatingFilter: true });
  });

  it('clears the filter config for undefined', () => {
    const prev = state({ a: { colId: 'a', filter: { enabled: true } } });
    expect(applyFilterPrimaryKindReducer(['a'], undefined)(prev).assignments.a).not.toHaveProperty(
      'filter',
    );
  });

  it('does nothing for an empty column list', () => {
    const prev = state();
    expect(applyFilterPrimaryKindReducer([], 'streamSafeMultiColumnFilter')(prev)).toBe(prev);
  });

  it('starts from an empty state when there is no prior one', () => {
    expect(
      applyFilterPrimaryKindReducer(['a'], 'streamSafeMultiColumnFilter')(undefined).assignments.a,
    ).toBeDefined();
  });
});

describe('applyFloatingFilterReducer', () => {
  it('turns the floating row on, creating a filter config to hang it off', () => {
    expect(applyFloatingFilterReducer(['a'], true)(state()).assignments.a?.filter).toMatchObject({
      enabled: true,
      floatingFilter: true,
    });
  });

  it('turns the floating row off', () => {
    const prev = state({ a: { colId: 'a', filter: { enabled: true, floatingFilter: true } } });
    expect(applyFloatingFilterReducer(['a'], false)(prev).assignments.a?.filter).toMatchObject({
      floatingFilter: false,
    });
  });

  it('does not re-enable a filter the user turned off', () => {
    const prev = state({ a: { colId: 'a', filter: { enabled: false } } });
    expect(applyFloatingFilterReducer(['a'], true)(prev).assignments.a?.filter).toMatchObject({
      enabled: false,
    });
  });

  it('does nothing for an empty column list', () => {
    const prev = state();
    expect(applyFloatingFilterReducer([], true)(prev)).toBe(prev);
  });

  it('starts from an empty state when there is no prior one', () => {
    expect(applyFloatingFilterReducer(['a'], true)(undefined).assignments.a).toBeDefined();
  });
});

describe('applyFormatterReducer', () => {
  const template = { id: 't1' } as never;

  it('writes the template onto each selected column', () => {
    expect(applyFormatterReducer(['a'], template)(state()).assignments.a).toMatchObject({
      valueFormatterTemplate: template,
    });
  });

  it('clears any cell renderer that would paint over the format', () => {
    const prev = state({
      a: { colId: 'a', cellRendererId: 'r1', cellRendererConfig: { x: 1 } },
    });
    const next = applyFormatterReducer(['a'], template)(prev).assignments.a;

    expect(next).not.toHaveProperty('cellRendererId');
    expect(next).not.toHaveProperty('cellRendererConfig');
  });

  it('clears the template without disturbing the renderer', () => {
    const prev = state({
      a: { colId: 'a', valueFormatterTemplate: template, cellRendererId: 'r1' },
    });
    const next = applyFormatterReducer(['a'], undefined)(prev).assignments.a;

    expect(next).not.toHaveProperty('valueFormatterTemplate');
    expect(next).toMatchObject({ cellRendererId: 'r1' });
  });

  it('writes the number slot for an all-columns write', () => {
    expect(applyFormatterReducer([], template, 'all')(state())).toMatchObject({
      globalCellNumberFormatter: template,
    });
  });

  it('writes the date slot when asked', () => {
    expect(applyFormatterReducer([], template, 'all', 'date')(state())).toMatchObject({
      globalCellDateFormatter: template,
    });
  });

  it('clears a global slot', () => {
    const prev = { assignments: {}, globalCellNumberFormatter: template } as never;
    expect(applyFormatterReducer([], undefined, 'all')(prev)).not.toHaveProperty(
      'globalCellNumberFormatter',
    );
  });

  it('clears the date slot', () => {
    const prev = { assignments: {}, globalCellDateFormatter: template } as never;
    expect(applyFormatterReducer([], undefined, 'all', 'date')(prev)).not.toHaveProperty(
      'globalCellDateFormatter',
    );
  });

  it('does nothing for an empty column list in the selected scope', () => {
    const prev = state();
    expect(applyFormatterReducer([], template)(prev)).toBe(prev);
  });

  it('starts from an empty state when there is no prior one', () => {
    expect(applyFormatterReducer(['a'], template)(undefined).assignments.a).toBeDefined();
    expect(applyFormatterReducer([], template, 'all')(undefined)).toMatchObject({
      globalCellNumberFormatter: template,
    });
  });
});

describe('applyTemplateToColumnsReducer', () => {
  it('replaces the chain rather than layering onto it', () => {
    const prev = state({ a: { colId: 'a', templateIds: ['old'] } });
    expect(applyTemplateToColumnsReducer(['a'], 't1')(prev).assignments.a).toMatchObject({
      templateIds: ['t1'],
    });
  });

  it('does nothing for an empty column list or an empty id', () => {
    const prev = state({ a: { colId: 'a' } });
    expect(applyTemplateToColumnsReducer([], 't1')(prev)).toBe(prev);
    expect(applyTemplateToColumnsReducer(['a'], '')(prev)).toBe(prev);
  });

  it('starts from an empty state when there is no prior one', () => {
    expect(applyTemplateToColumnsReducer(['a'], 't1')(undefined).assignments.a).toMatchObject({
      templateIds: ['t1'],
    });
  });
});

describe('removeTemplateRefFromAssignmentsReducer', () => {
  it('removes the id from every chain that names it', () => {
    const prev = state({
      a: { colId: 'a', templateIds: ['t1', 't2'] },
      b: { colId: 'b', templateIds: ['t2'] },
    });
    const next = removeTemplateRefFromAssignmentsReducer('t1')(prev);

    expect(next.assignments.a).toMatchObject({ templateIds: ['t2'] });
    expect(next.assignments.b).toMatchObject({ templateIds: ['t2'] });
  });

  it('deletes the chain entirely when nothing is left', () => {
    // An empty array and an absent key resolve differently — absent falls
    // back to typeDefaults, which is what a column with no templates means.
    const prev = state({ a: { colId: 'a', templateIds: ['t1'] } });
    expect(
      removeTemplateRefFromAssignmentsReducer('t1')(prev).assignments.a,
    ).not.toHaveProperty('templateIds');
  });

  it('returns the same state when no column referenced the template', () => {
    const prev = state({ a: { colId: 'a', templateIds: ['t2'] }, b: { colId: 'b' } });
    expect(removeTemplateRefFromAssignmentsReducer('t1')(prev)).toBe(prev);
  });

  it('does nothing for an empty id', () => {
    const prev = state({ a: { colId: 'a', templateIds: ['t1'] } });
    expect(removeTemplateRefFromAssignmentsReducer('')(prev)).toBe(prev);
  });

  it('starts from an empty state when there is no prior one', () => {
    expect(removeTemplateRefFromAssignmentsReducer('t1')(undefined).assignments).toEqual({});
  });
});

describe('clearAllStylesReducer', () => {
  it('resets each listed column to a bare assignment', () => {
    const prev = state({
      a: { colId: 'a', headerName: 'X', editable: true, templateIds: ['t1'] },
      b: { colId: 'b', headerName: 'Y' },
    });
    const next = clearAllStylesReducer(['a'])(prev);

    expect(next.assignments.a).toEqual({ colId: 'a' });
    expect(next.assignments.b).toMatchObject({ headerName: 'Y' });
  });

  it('does nothing for an empty column list', () => {
    const prev = state({ a: { colId: 'a', headerName: 'X' } });
    expect(clearAllStylesReducer([])(prev)).toBe(prev);
  });

  it('starts from an empty state when there is no prior one', () => {
    expect(clearAllStylesReducer(['a'])(undefined).assignments.a).toEqual({ colId: 'a' });
  });
});
