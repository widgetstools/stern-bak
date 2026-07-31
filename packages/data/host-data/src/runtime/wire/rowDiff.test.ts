import { describe, expect, it } from 'vitest';
import { diffTopLevel } from './rowDiff.js';

describe('diffTopLevel', () => {
  it('returns identical for equal rows (fresh objects, same values)', () => {
    expect(diffTopLevel(
      { id: 'a', px: 1, meta: { x: 1 } },
      { id: 'a', px: 1, meta: { x: 1 } },
    )).toBe('identical');
  });

  it('reports changed and added top-level fields in s', () => {
    const diff = diffTopLevel(
      { id: 'a', px: 1, qty: 10 },
      { id: 'a', px: 2, qty: 10, side: 'B' },
    );
    expect(diff).toEqual({ s: { px: 2, side: 'B' } });
  });

  it('reports removed top-level fields in d', () => {
    const diff = diffTopLevel(
      { id: 'a', px: 1, stale: true },
      { id: 'a', px: 1 },
    );
    expect(diff).toEqual({ d: ['stale'] });
  });

  it('treats an explicit undefined on next as removal', () => {
    const diff = diffTopLevel(
      { id: 'a', note: 'x' },
      { id: 'a', note: undefined },
    );
    expect(diff).toEqual({ d: ['note'] });
  });

  it('ships a changed nested object whole as one top-level field', () => {
    const next = { id: 'a', meta: { venue: 'Y', depth: [1] } };
    const diff = diffTopLevel(
      { id: 'a', meta: { venue: 'X', depth: [1] } },
      next,
    );
    expect(diff).toEqual({ s: { meta: next.meta } });
  });

  it('distinguishes null from absent', () => {
    expect(diffTopLevel({ id: 'a', v: null }, { id: 'a', v: null })).toBe('identical');
    expect(diffTopLevel({ id: 'a', v: 1 }, { id: 'a', v: null })).toEqual({ s: { v: null } });
  });

  it('returns opaque for non-plain-object rows', () => {
    expect(diffTopLevel(null, { id: 'a' })).toBe('opaque');
    expect(diffTopLevel({ id: 'a' }, [1, 2])).toBe('opaque');
    expect(diffTopLevel('row', { id: 'a' })).toBe('opaque');
  });
});
