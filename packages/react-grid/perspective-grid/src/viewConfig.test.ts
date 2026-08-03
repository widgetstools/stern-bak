import { describe, expect, it } from 'vitest';
import { toPerspectiveViewConfig } from '@wellsfargo-starui/core';
import {
  blankUnaggregatedNonNumeric,
  toGroupColumns,
  toTreeColumns,
  viewConfigKey,
  TREE_GROUP_FIELD,
  TREE_KEY_FIELD,
} from './viewConfig.js';

describe('viewConfigKey', () => {
  it('is stable across key order and object identity', () => {
    const a = toPerspectiveViewConfig({
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [
        { id: 'pnl', aggFunc: 'sum' },
        { id: 'price', aggFunc: 'avg' },
      ],
    });
    const b = toPerspectiveViewConfig({
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [
        { id: 'price', aggFunc: 'avg' },
        { id: 'pnl', aggFunc: 'sum' },
      ],
    });
    expect(viewConfigKey(a)).toBe(viewConfigKey(b));
  });

  it('changes when the config meaningfully changes', () => {
    const base = viewConfigKey(
      toPerspectiveViewConfig({ sortModel: [{ colId: 'a', sort: 'asc' }] }),
    );
    const sorted = viewConfigKey(
      toPerspectiveViewConfig({ sortModel: [{ colId: 'a', sort: 'desc' }] }),
    );
    expect(base).not.toBe(sorted);
  });

  it('does not change for a repeated identical request (no needless View rebuild)', () => {
    const make = () =>
      toPerspectiveViewConfig({
        sortModel: [{ colId: 'pnl', sort: 'desc' }],
        filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'RATES' } },
      });
    expect(viewConfigKey(make())).toBe(viewConfigKey(make()));
  });

  it('normalizes expression key order too, so a rebuilt calc map reuses the View', () => {
    const a = viewConfigKey({ expressions: { b: '2', a: '1' } });
    const b = viewConfigKey({ expressions: { a: '1', b: '2' } });
    expect(a).toBe(b);
  });
});

describe('toGroupColumns', () => {
  it('moves the deepest __ROW_PATH__ entry onto the group column and drops the path', () => {
    const columns = { __ROW_PATH__: [['Energy'], ['Technology']], pnl: [10, 20] };
    expect(toGroupColumns(columns, 'sector')).toEqual({
      sector: ['Energy', 'Technology'],
      pnl: [10, 20],
    });
  });

  it('takes the LAST path entry, so a nested level shows its own key', () => {
    const columns = {
      __ROW_PATH__: [
        ['Energy', 'FI-GOVT'],
        ['Energy', 'FX-SPOT'],
      ],
      pnl: [10, 20],
    };
    expect(toGroupColumns(columns, 'book').book).toEqual(['FI-GOVT', 'FX-SPOT']);
  });

  it('overwrites the aggregated column of the same name with the group key', () => {
    const columns = {
      __ROW_PATH__: [['Energy']],
      sector: ['whatever the agg produced'],
      pnl: [10],
    };
    expect(toGroupColumns(columns, 'sector').sector).toEqual(['Energy']);
  });

  it('maps the grand-total row (empty path) to null rather than undefined', () => {
    expect(toGroupColumns({ __ROW_PATH__: [[]], pnl: [1] }, 'sector').sector).toEqual([null]);
  });

  it('passes an ungrouped window through untouched', () => {
    const columns = { positionId: ['a'], pnl: [1] };
    expect(toGroupColumns(columns, 'sector')).toBe(columns);
  });
});

/**
 * AG reads a tree hierarchy off the DATA — there are no group columns to read
 * it from — so the parent rows have to carry the markers themselves.
 */
describe('toTreeColumns', () => {
  it('stamps the key and the group marker alongside the remapped column', () => {
    const out = toTreeColumns({ __ROW_PATH__: [['Energy'], ['Rates']], pnl: [1, 2] }, 'sector');
    expect(out.sector).toEqual(['Energy', 'Rates']);
    expect(out[TREE_KEY_FIELD]).toEqual(['Energy', 'Rates']);
    expect(out[TREE_GROUP_FIELD]).toEqual([true, true]);
  });

  it('keys a null group (the level total) as the empty string, never as "null"', () => {
    const out = toTreeColumns({ __ROW_PATH__: [[]], pnl: [1] }, 'sector');
    expect(out[TREE_KEY_FIELD]).toEqual(['']);
  });

  it('stringifies a non-string key — getServerSideGroupKey must answer a string', () => {
    const out = toTreeColumns({ __ROW_PATH__: [[2026]], pnl: [1] }, 'year');
    expect(out[TREE_KEY_FIELD]).toEqual(['2026']);
  });

  it('marks nothing on an ungrouped window, so isServerSideGroup answers false', () => {
    const out = toTreeColumns({ positionId: ['a'] }, 'sector');
    expect(out[TREE_KEY_FIELD]).toBeUndefined();
    expect(out[TREE_GROUP_FIELD]).toBeUndefined();
  });
});

describe('blankUnaggregatedNonNumeric', () => {
  const schema = {
    positionId: 'string',
    desk: 'string',
    asOf: 'datetime',
    active: 'boolean',
    quantity: 'integer',
    pnl: 'float',
  };

  it('blanks a text column the user did not ask to aggregate', () => {
    // AG leaves an un-aggregated column empty in a group row. Perspective
    // fills it with the type's default — a distinct-count for a string — so a
    // text column renders a number under a group header.
    const out = blankUnaggregatedNonNumeric({ desk: [3, 2], quantity: [10, 20] }, { schema });
    expect(out.desk).toEqual([null, null]);
  });

  it('leaves numeric columns alone — a totals row is what they are for', () => {
    const out = blankUnaggregatedNonNumeric(
      { quantity: [10, 20], pnl: [1.5, 2.5] },
      { schema },
    );
    expect(out.quantity).toEqual([10, 20]);
    expect(out.pnl).toEqual([1.5, 2.5]);
  });

  it('keeps a non-numeric column the user DID aggregate', () => {
    // `first` / `last` are the two that mean anything for text, and opting in
    // is the whole escape hatch.
    const out = blankUnaggregatedNonNumeric(
      { desk: ['Rates', 'Credit'] },
      { schema, aggregates: { desk: 'first' } },
    );
    expect(out.desk).toEqual(['Rates', 'Credit']);
  });

  it('blanks dates and booleans too, not just strings', () => {
    const out = blankUnaggregatedNonNumeric({ asOf: [1, 2], active: [2, 1] }, { schema });
    expect(out.asOf).toEqual([null, null]);
    expect(out.active).toEqual([null, null]);
  });

  it('never blanks the structural columns', () => {
    // The group column carries the path key; blanking it erases the group
    // label itself.
    const out = blankUnaggregatedNonNumeric(
      { desk: ['Rates'], __ROW_PATH__: [['Rates']] },
      { schema, keep: ['desk'] },
    );
    expect(out.desk).toEqual(['Rates']);
    expect(out.__ROW_PATH__).toEqual([['Rates']]);
  });

  it('tolerates a null entry in `keep`, which is what a leaf level passes', () => {
    const out = blankUnaggregatedNonNumeric({ desk: [3] }, { schema, keep: [null] });
    expect(out.desk).toEqual([null]);
  });

  it('leaves columns the schema does not know — expression columns', () => {
    // Quick-filter and calculated columns are not in `table.schema()`; guessing
    // about them would blank a calculated total.
    const out = blankUnaggregatedNonNumeric({ calc_pnlPct: [1, 2] }, { schema });
    expect(out.calc_pnlPct).toEqual([1, 2]);
  });

  it('changes nothing without a schema', () => {
    const columns = { desk: [3, 2] };
    expect(blankUnaggregatedNonNumeric(columns, { schema: null })).toBe(columns);
  });

  it('returns the same object when there was nothing to blank', () => {
    const columns = { quantity: [1, 2] };
    expect(blankUnaggregatedNonNumeric(columns, { schema })).toBe(columns);
  });
});
