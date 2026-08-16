import { describe, expect, it } from 'vitest';
import type {
  CellClassParams,
  EditableCallbackParams,
  RowClassParams,
} from 'ag-grid-community';
import {
  ssrmAlertRowClass,
  ssrmCellStyle,
  ssrmEditable,
  ssrmGetChildCount,
  withSsrmDefaultColDef,
  withSsrmExpressionBindings,
  type SsrmBindableColDef,
} from './expressionBindings.js';

const cell = (data: unknown, colId = 'px') =>
  ({ data, column: { getColId: () => colId } }) as unknown as CellClassParams;

const editParams = (data: unknown, colId = 'px') =>
  ({ data, column: { getColId: () => colId } }) as unknown as EditableCallbackParams;

const styleOf = (def: SsrmBindableColDef, params: CellClassParams) =>
  (def.cellStyle as (p: CellClassParams) => unknown)(params);

const editableOf = (def: SsrmBindableColDef, params: EditableCallbackParams) =>
  (def.editable as (p: EditableCallbackParams) => boolean)(params);

describe('ssrmGetChildCount', () => {
  it('reads __ssrmChildCount and falls back to 0', () => {
    expect(ssrmGetChildCount({ __ssrmChildCount: 4 })).toBe(4);
    expect(ssrmGetChildCount({ __ssrmChildCount: Number.NaN })).toBe(0);
    expect(ssrmGetChildCount(undefined)).toBe(0);
  });
});

describe('ssrmAlertRowClass', () => {
  it('marks a row the plane flagged', () => {
    const row = (data: unknown) => ({ data }) as unknown as RowClassParams;
    expect(ssrmAlertRowClass(row({ __ssrmAlert: true }))).toBe('alert-row');
    expect(ssrmAlertRowClass(row({}))).toBeUndefined();
  });
});

describe('ssrmCellStyle', () => {
  it('returns the plane style, or null when there is none', () => {
    expect(ssrmCellStyle(cell({ __ssrmStyle: { color: 'red' } }))).toEqual({ color: 'red' });
    expect(ssrmCellStyle(cell({}))).toBeNull();
    expect(ssrmCellStyle(cell(undefined))).toBeNull();
  });
});

/**
 * The reason this had no caller: it used to answer `false` for every row that
 * carried no verdict — which is every row of every grid that has never pushed
 * an `editable` rule. Binding it would have made the grid read-only.
 */
describe('ssrmEditable', () => {
  it('does not veto when the plane has no opinion', () => {
    expect(ssrmEditable('px')(editParams({ id: 'a' }))).toBe(true);
  });

  it('honours a whole-row verdict', () => {
    expect(ssrmEditable('px')(editParams({ __ssrmEditable: false }))).toBe(false);
    expect(ssrmEditable('px')(editParams({ __ssrmEditable: true }))).toBe(true);
  });

  it('honours a per-field verdict, and leaves unnamed fields alone', () => {
    const data = { __ssrmEditable: { px: false } };
    expect(ssrmEditable('px')(editParams(data))).toBe(false);
    expect(ssrmEditable('qty')(editParams(data))).toBe(true);
  });

  it('refuses a loading stub — there is nothing to edit yet', () => {
    expect(ssrmEditable('px')(editParams(undefined))).toBe(false);
  });
});

describe('withSsrmExpressionBindings', () => {
  it('merges the plane style OVER the column\'s own, never replacing it', () => {
    const [def] = withSsrmExpressionBindings([
      { field: 'px', cellStyle: () => ({ color: 'blue', fontWeight: 'bold' }) },
    ]);
    expect(styleOf(def, cell({ __ssrmStyle: { color: 'red' } }))).toEqual({
      color: 'red',
      fontWeight: 'bold',
    });
  });

  it('keeps the column\'s own style when the plane has none', () => {
    const [def] = withSsrmExpressionBindings([
      { field: 'px', cellStyle: { color: 'blue' } },
    ]);
    expect(styleOf(def, cell({}))).toEqual({ color: 'blue' });
  });

  it('ANDs editability — a rule can lock, never unlock', () => {
    const [locked] = withSsrmExpressionBindings([{ field: 'px', editable: false }]);
    expect(editableOf(locked, editParams({ __ssrmEditable: true }))).toBe(false);

    const [open] = withSsrmExpressionBindings([{ field: 'px', editable: true }]);
    expect(editableOf(open, editParams({ __ssrmEditable: { px: false } }))).toBe(false);
    expect(editableOf(open, editParams({}))).toBe(true);
  });

  it('leaves a column that declares neither property untouched, so defaultColDef still decides', () => {
    const [def] = withSsrmExpressionBindings([{ field: 'px' }]);
    expect('cellStyle' in def).toBe(false);
    expect('editable' in def).toBe(false);
  });

  it('walks column groups', () => {
    const [group] = withSsrmExpressionBindings([
      { headerName: 'G', children: [{ field: 'px', editable: true }] },
    ]);
    const child = group.children![0];
    expect(editableOf(child, editParams({ __ssrmEditable: { px: false } }))).toBe(false);
  });
});

describe('withSsrmDefaultColDef', () => {
  it('gates the defaults, which is where this repo\'s editability lives', () => {
    const def = withSsrmDefaultColDef({ editable: true });
    expect(editableOf(def, editParams({ __ssrmEditable: { px: false } }, 'px'))).toBe(false);
    expect(editableOf(def, editParams({ __ssrmEditable: { qty: false } }, 'px'))).toBe(true);
  });

  it('does not turn a read-only grid editable', () => {
    const def = withSsrmDefaultColDef(undefined);
    expect(editableOf(def, editParams({ __ssrmEditable: true }, 'px'))).toBe(false);
  });

  it('installs the style hook even when the defaults had none', () => {
    const def = withSsrmDefaultColDef({ resizable: true });
    expect(styleOf(def, cell({ __ssrmStyle: { color: 'red' } }))).toEqual({ color: 'red' });
    expect(styleOf(def, cell({}))).toBeNull();
    expect(def.resizable).toBe(true);
  });
});
