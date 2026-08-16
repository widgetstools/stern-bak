import { describe, expect, it } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { quickFilterColumnsOf } from './quickFilterColumns';

interface FakeColumn {
  colId: string;
  field?: string;
}

function makeApi(opts: {
  displayed?: FakeColumn[];
  all?: FakeColumn[];
  includeHidden?: boolean;
  throws?: boolean;
}): GridApi {
  const wrap = (columns: FakeColumn[] | undefined) =>
    columns?.map((c) => ({
      getColId: () => c.colId,
      getColDef: () => ({ field: c.field }),
    })) ?? null;
  return {
    getGridOption: (name: string) => {
      if (opts.throws) throw new Error('grid destroyed');
      return name === 'includeHiddenColumnsInQuickFilter' ? opts.includeHidden : undefined;
    },
    getAllDisplayedColumns: () => wrap(opts.displayed) ?? [],
    getColumns: () => wrap(opts.all),
  } as unknown as GridApi;
}

describe('quickFilterColumnsOf', () => {
  it('reports the fields of the columns the grid is displaying', () => {
    const api = makeApi({
      displayed: [{ colId: 'book', field: 'book' }, { colId: 'bid', field: 'quote.bid' }],
      all: [{ colId: 'book', field: 'book' }, { colId: 'secret', field: 'secret' }],
    });
    expect(quickFilterColumnsOf(api)).toEqual(['book', 'quote.bid']);
  });

  it('reports every column when the grid includes hidden ones', () => {
    const api = makeApi({
      includeHidden: true,
      displayed: [{ colId: 'book', field: 'book' }],
      all: [{ colId: 'book', field: 'book' }, { colId: 'secret', field: 'secret' }],
    });
    expect(quickFilterColumnsOf(api)).toEqual(['book', 'secret']);
  });

  it('falls back to the column id when a column declares no field', () => {
    expect(quickFilterColumnsOf(makeApi({ displayed: [{ colId: 'book' }] }))).toEqual(['book']);
  });

  it('skips generated columns and internal fields, and de-duplicates', () => {
    const api = makeApi({
      displayed: [
        { colId: 'ag-Grid-AutoColumn', field: undefined },
        { colId: 'ag-Grid-SelectionColumn' },
        { colId: 'internal', field: '__ssrmGroupKey' },
        { colId: 'book', field: 'book' },
        { colId: 'bookAgain', field: 'book' },
      ],
    });
    expect(quickFilterColumnsOf(api)).toEqual(['book']);
  });

  it('says nothing rather than something wrong when it cannot tell', () => {
    // Undefined means "every field", which is what the worker does without a
    // scope — the honest answer when the column state is unreadable.
    expect(quickFilterColumnsOf(makeApi({ displayed: [] }))).toBeUndefined();
    expect(quickFilterColumnsOf(makeApi({ throws: true }))).toBeUndefined();
    expect(
      quickFilterColumnsOf(makeApi({ includeHidden: true, all: undefined })),
    ).toBeUndefined();
  });
});
