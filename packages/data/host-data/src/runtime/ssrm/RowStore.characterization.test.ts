/**
 * Characterization tests for RowStore's observable surface.
 *
 * These pin behaviour across the removal of the internal `uniques` index
 * (column → value → key-set), which was maintained on every ingest but whose
 * only reader, `getUniqueValues`, had no callers. Everything asserted here
 * must hold identically before and after that change.
 */
import { describe, expect, it } from 'vitest';
import { RowStore } from './RowStore.js';

const seed = () => [
  { id: '1', book: 'A', px: 10, tag: null },
  { id: '2', book: 'B', px: 20, tag: 'x' },
  { id: '3', book: 'A', px: 30, tag: 'y' },
];

function store(rows = seed()) {
  const s = new RowStore({ keyColumn: 'id' });
  s.replaceSnapshot(rows);
  return s;
}

describe('RowStore.getUniqueValues', () => {
  it('returns sorted distinct values for a column', () => {
    expect(store().getUniqueValues('book')).toEqual(['A', 'B']);
  });

  it('represents null and missing values as the empty string', () => {
    expect(store().getUniqueValues('tag')).toEqual(['', 'x', 'y']);
  });

  it('returns an empty list for an unknown column', () => {
    expect(store().getUniqueValues('nope')).toEqual([]);
  });

  it('reflects upserts that introduce a new value', () => {
    const s = store();
    s.upsert([{ id: '4', book: 'C' }]);
    expect(s.getUniqueValues('book')).toEqual(['A', 'B', 'C']);
  });

  it('reflects an upsert that moves the last row off a value', () => {
    const s = store();
    s.upsert([{ id: '2', book: 'A' }]);
    expect(s.getUniqueValues('book')).toEqual(['A']);
  });

  it('reflects removals', () => {
    const s = store();
    s.remove(['2']);
    expect(s.getUniqueValues('book')).toEqual(['A']);
  });

  it('is empty after clear', () => {
    const s = store();
    s.clear();
    expect(s.getUniqueValues('book')).toEqual([]);
  });

  it('matches getUniqueValuesFiltered with no predicate', () => {
    const s = store();
    expect(s.getUniqueValues('book')).toEqual(s.getUniqueValuesFiltered('book'));
  });
});

describe('RowStore ingest semantics', () => {
  it('sparse-merges an upsert instead of replacing the row', () => {
    const s = store();
    s.upsert([{ id: '1', px: 99 }]);
    expect(s.getRow('1')).toMatchObject({ id: '1', book: 'A', px: 99 });
  });

  it('bumps revision on snapshot, upsert and remove', () => {
    const s = store();
    const r0 = s.getRevision();
    s.upsert([{ id: '1', px: 11 }]);
    const r1 = s.getRevision();
    s.remove(['3']);
    const r2 = s.getRevision();
    expect(r1).toBeGreaterThan(r0);
    expect(r2).toBeGreaterThan(r1);
  });

  it('does not bump revision when an upsert matches nothing', () => {
    const s = store();
    const before = s.getRevision();
    s.upsert([]);
    expect(s.getRevision()).toBe(before);
  });

  it('reports row count and columns in stats', () => {
    const stats = store().getStats();
    expect(stats.rowCount).toBe(3);
    expect(stats.columns).toEqual(expect.arrayContaining(['id', 'book', 'px']));
  });
});
