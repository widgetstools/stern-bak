import { describe, expect, it } from 'vitest';
import { labRowFieldPatch, labRowsEqual } from './rowDiff';
import type { LabRow } from './types';

function row(id: string, bid = 100): LabRow {
  return { id, bidPrice: bid, midPrice: bid, askPrice: bid + 0.1 } as LabRow;
}

describe('labRowsEqual', () => {
  it('returns true for identical row objects', () => {
    const a = row('a', 100);
    expect(labRowsEqual(a, { ...a })).toBe(true);
  });

  it('returns false when a field differs', () => {
    expect(labRowsEqual(row('a', 100), row('a', 101))).toBe(false);
  });
});

describe('labRowFieldPatch', () => {
  it('returns changed fields excluding id', () => {
    const before = row('a', 100);
    const after = row('a', 105);
    expect(labRowFieldPatch(before, after)).toEqual({ bidPrice: 105, midPrice: 105, askPrice: 105.1 });
  });

  it('returns null when rows match', () => {
    const a = row('a', 100);
    expect(labRowFieldPatch(a, { ...a })).toBeNull();
  });
});
