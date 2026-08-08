import { describe, expect, it } from 'vitest';
import { ssrmGetRowId } from './ssrmGetRowId.js';

describe('ssrmGetRowId', () => {
  it('uses key column value when present', () => {
    expect(ssrmGetRowId({ id: 'abc' }, 'id')).toBe('abc');
  });

  it('uses __ssrmGroupKey for group rows', () => {
    expect(ssrmGetRowId({ __ssrmGroupKey: 'grp-1' }, 'id')).toBe('grp-1');
  });

  it('returns the same anonymous id for repeated calls on the same object', () => {
    const row = { orphan: true };
    const first = ssrmGetRowId(row, 'id');
    const second = ssrmGetRowId(row, 'id');
    expect(first).toBe(second);
    expect(first).toMatch(/^__ssrm_anon_/);
  });

  it('does not use Math.random-style unstable ids', () => {
    const row = { orphan: true };
    const ids = new Set(Array.from({ length: 20 }, () => ssrmGetRowId(row, 'id')));
    expect(ids.size).toBe(1);
  });
});
