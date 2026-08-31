import { describe, expect, it } from 'vitest';
import type { ColDef, ColGroupDef } from 'ag-grid-community';
import {
  INDEX_COLUMN,
  buildSchemaFromColDefs,
  flattenRow,
  flattenRowsColumnar,
  typeForColDef,
} from './schema.js';

describe('typeForColDef', () => {
  it('maps cellDataType first', () => {
    expect(typeForColDef({ cellDataType: 'number' })).toBe('float');
    expect(typeForColDef({ cellDataType: 'date' })).toBe('datetime');
    expect(typeForColDef({ cellDataType: 'dateString' })).toBe('datetime');
    expect(typeForColDef({ cellDataType: 'boolean' })).toBe('boolean');
    expect(typeForColDef({ cellDataType: 'text' })).toBe('string');
  });

  it('falls back to the filter component', () => {
    expect(typeForColDef({ filter: 'agNumberColumnFilter' })).toBe('float');
    expect(typeForColDef({ filter: 'agDateColumnFilter' })).toBe('datetime');
  });

  it('reads the Multi Filter first tab (buildColumnDefs default shape)', () => {
    const def: ColDef = {
      filter: 'agMultiColumnFilter',
      filterParams: { filters: [{ filter: 'agNumberColumnFilter' }, { filter: 'agSetColumnFilter' }] },
    };
    expect(typeForColDef(def)).toBe('float');
    const dateDef: ColDef = {
      filter: 'agMultiColumnFilter',
      filterParams: { filters: [{ filter: 'agDateColumnFilter' }, { filter: 'agSetColumnFilter' }] },
    };
    expect(typeForColDef(dateDef)).toBe('datetime');
  });

  it('infers from set-filter value lists', () => {
    expect(typeForColDef({ filterParams: { values: [true, false] } })).toBe('boolean');
    expect(typeForColDef({ filterParams: { values: [1, 2, 3] } })).toBe('float');
    expect(typeForColDef({ filterParams: { values: ['a', 1] } })).toBe('string');
  });

  it('defaults to string', () => {
    expect(typeForColDef({})).toBe('string');
  });
});

describe('buildSchemaFromColDefs', () => {
  it('walks column groups, prefers field, falls back to colId, appends the index column', () => {
    const defs: (ColDef | ColGroupDef)[] = [
      { field: 'cusip', cellDataType: 'text' },
      {
        headerName: 'Risk',
        children: [
          { field: 'pnl', cellDataType: 'number' },
          { colId: 'derived', cellDataType: 'number' },
        ],
      },
      { headerName: 'no field or colId' },
    ];
    expect(buildSchemaFromColDefs(defs)).toEqual({
      cusip: 'string',
      pnl: 'float',
      derived: 'float',
      [INDEX_COLUMN]: 'string',
    });
  });
});

describe('flattenRow', () => {
  const columns = new Set(['cusip', 'rating.moody', 'legs', INDEX_COLUMN]);

  it('flattens nested objects onto dotted keys and keeps only schema columns', () => {
    const flat = flattenRow(
      { cusip: 'X1', rating: { moody: 'Aa1', sp: 'AA' }, extra: 42 },
      columns,
    );
    expect(flat).toEqual({ cusip: 'X1', 'rating.moody': 'Aa1' });
  });

  it('joins arrays into a renderable string when the column exists', () => {
    expect(flattenRow({ legs: [1, 2] }, columns)).toEqual({ legs: '1, 2' });
    expect(flattenRow({ other: [1, 2] }, columns)).toEqual({});
  });

  it('passes Date values through as scalars', () => {
    const when = new Date(1700000000000);
    const cols = new Set(['ts']);
    expect(flattenRow({ ts: when }, cols)).toEqual({ ts: when });
  });
});

describe('flattenRowsColumnar', () => {
  it('emits one array per column with nulls for rows missing a value', () => {
    const columns = new Set(['a', 'b.c']);
    const out = flattenRowsColumnar(
      [{ a: 1 }, { a: 2, b: { c: 'x' } }],
      columns,
    );
    expect(out).toEqual({ a: [1, 2], 'b.c': [null, 'x'] });
  });

  it('backfills nulls when a column first appears mid-batch', () => {
    const columns = new Set(['a']);
    const out = flattenRowsColumnar([{}, {}, { a: 7 }], columns);
    expect(out.a).toEqual([null, null, 7]);
  });
});
