import { describe, expect, it } from 'vitest';
import { QueryEngine } from './QueryEngine.js';
import { RowStore } from './RowStore.js';

function seeded() {
  const store = new RowStore({ keyColumn: 'positionId' });
  store.replaceSnapshot([
    { positionId: 'P1', book: 'A', desk: 'RATES', px: 10 },
    { positionId: 'P2', book: 'A', desk: 'RATES', px: 20 },
    { positionId: 'P3', book: 'A', desk: 'FX', px: 30 },
    { positionId: 'P4', book: 'B', desk: 'RATES', px: 40 },
  ]);
  return new QueryEngine({ store });
}

describe('getSetFilterValues group scoping', () => {
  it('scopes values to a group path', () => {
    const engine = seeded();
    const values = engine.getSetFilterValues({
      column: 'positionId',
      groupKeys: ['A'],
      rowGroupCols: [{ field: 'book' }],
    });
    expect(values.sort()).toEqual(['P1', 'P2', 'P3']);
  });

  it('scopes to a nested group path', () => {
    const engine = seeded();
    const values = engine.getSetFilterValues({
      column: 'positionId',
      groupKeys: ['A', 'RATES'],
      rowGroupCols: [{ field: 'book' }, { field: 'desk' }],
    });
    expect(values.sort()).toEqual(['P1', 'P2']);
  });

  it('ANDs the group path with the filter model', () => {
    const engine = seeded();
    const values = engine.getSetFilterValues({
      column: 'positionId',
      filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'RATES' } },
      groupKeys: ['A'],
      rowGroupCols: [{ field: 'book' }],
    });
    expect(values.sort()).toEqual(['P1', 'P2']);
  });

  it('behaves exactly as before when no groupKeys are given', () => {
    const engine = seeded();
    const values = engine.getSetFilterValues({ column: 'book' });
    expect(values.sort()).toEqual(['A', 'B']);
  });

  it('returns every key for an empty group path with rowGroupCols set (select-all)', () => {
    const engine = seeded();
    const values = engine.getSetFilterValues({
      column: 'positionId',
      groupKeys: [],
      rowGroupCols: [{ field: 'book' }],
    });
    expect(values.sort()).toEqual(['P1', 'P2', 'P3', 'P4']);
  });
});
