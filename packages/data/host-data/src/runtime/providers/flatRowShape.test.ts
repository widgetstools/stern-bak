import { describe, expect, it } from 'vitest';
import type { ColumnDefinition } from '@wellsfargo-starui/types';
import { collectFlatRowPaths, createFlatRowFlattener } from './flatRowShape.js';

const cols = (...fields: string[]): ColumnDefinition[] =>
  fields.map((field) => ({ field, headerName: field }));

describe('collectFlatRowPaths', () => {
  it('unions column fields with the key column', () => {
    expect(collectFlatRowPaths(cols('a', 'b.c'), 'id').sort()).toEqual(['a', 'b.c', 'id']);
  });

  it('takes every part of a composite key', () => {
    expect(collectFlatRowPaths(cols('a'), ['x', 'y']).sort()).toEqual(['a', 'x', 'y']);
  });

  it('deduplicates a key column that is also a column def', () => {
    expect(collectFlatRowPaths(cols('id', 'a'), 'id').sort()).toEqual(['a', 'id']);
  });

  it('answers empty for nothing declared', () => {
    expect(collectFlatRowPaths(undefined, undefined)).toEqual([]);
  });
});

describe('createFlatRowFlattener', () => {
  it('lifts a nested path onto its literal dotted key', () => {
    const flatten = createFlatRowFlattener(cols('id', 'rating.moody'), 'id')!;
    expect(flatten({ id: 'p1', rating: { moody: 'Aa2' }, other: 1 })).toEqual({
      id: 'p1',
      'rating.moody': 'Aa2',
    });
  });

  it('keeps nulls — a null is a value Perspective can hold', () => {
    const flatten = createFlatRowFlattener(cols('id', 'pnl'), 'id')!;
    expect(flatten({ id: 'p1', pnl: null })).toEqual({ id: 'p1', pnl: null });
  });

  /**
   * A column def pointing at an object or array has no flat representation,
   * and inventing one would put `"[object Object]"` into a typed column.
   */
  it('skips values that are not flat scalars', () => {
    const flatten = createFlatRowFlattener(cols('id', 'legs', 'meta'), 'id')!;
    expect(flatten({ id: 'p1', legs: [1, 2], meta: { a: 1 } })).toEqual({ id: 'p1' });
  });

  it('keeps a Date', () => {
    const when = new Date('2026-05-28T00:00:00Z');
    const flatten = createFlatRowFlattener(cols('id', 'maturity'), 'id')!;
    expect(flatten({ id: 'p1', maturity: when })).toEqual({ id: 'p1', maturity: when });
  });

  it('omits a path the row does not have rather than writing undefined', () => {
    const flatten = createFlatRowFlattener(cols('id', 'missing'), 'id')!;
    expect(flatten({ id: 'p1' })).toEqual({ id: 'p1' });
  });

  it('answers an empty object for a non-object row', () => {
    const flatten = createFlatRowFlattener(cols('id'), 'id')!;
    expect(flatten(null)).toEqual({});
    expect(flatten([1, 2])).toEqual({});
  });

  /** A flattener with no paths would emit empty objects for every row. */
  it('is null when there is nothing to lift', () => {
    expect(createFlatRowFlattener([], undefined)).toBeNull();
    expect(createFlatRowFlattener(undefined, undefined)).toBeNull();
  });
});
