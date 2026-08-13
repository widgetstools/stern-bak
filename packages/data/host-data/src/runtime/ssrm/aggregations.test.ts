import { describe, expect, it } from 'vitest';
import { aggregateRows } from './aggregations.js';

describe('aggregateRows empty and all-null groups', () => {
  it('reports min/max/avg as blank when no row has a value', () => {
    const rows = [{ px: null }, { px: undefined }, { px: '' }];

    const out = aggregateRows(rows, [
      { field: 'px', aggFunc: 'min' },
      { field: 'px', aggFunc: 'max' },
      { field: 'px', aggFunc: 'avg' },
    ]);

    // 0 is a real price; blank is the only honest answer for "no values".
    expect(out.px).toBeNull();
  });

  it('reports min/max/avg as blank for an empty row set', () => {
    expect(aggregateRows([], [{ field: 'px', aggFunc: 'min' }]).px).toBeNull();
    expect(aggregateRows([], [{ field: 'px', aggFunc: 'max' }]).px).toBeNull();
    expect(aggregateRows([], [{ field: 'px', aggFunc: 'avg' }]).px).toBeNull();
  });

  it('still counts rows in an all-null group', () => {
    const out = aggregateRows([{ px: null }, { px: null }], [
      { field: 'px', aggFunc: 'count' },
    ]);

    expect(out.px).toBe(2);
  });

  it('ignores nulls but keeps real values, including a genuine zero', () => {
    const rows = [{ px: null }, { px: 0 }, { px: 4 }];

    expect(aggregateRows(rows, [{ field: 'px', aggFunc: 'min' }]).px).toBe(0);
    expect(aggregateRows(rows, [{ field: 'px', aggFunc: 'max' }]).px).toBe(4);
    expect(aggregateRows(rows, [{ field: 'px', aggFunc: 'avg' }]).px).toBe(2);
  });
});
