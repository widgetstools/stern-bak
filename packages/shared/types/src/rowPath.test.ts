import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPOSITE_KEY_SEPARATOR, composeRowId, getPathAccessor, getPathSetter,
  getValueByPath, normalizeKeyColumns, __resetPathAccessorCaches,
} from './rowPath.js';

/**
 * These run per ROW on every hot path — hub cache upsert, STOMP conflation key,
 * AG Grid getRowId — so both the results and the memoisation behaviour matter.
 * A wrong row id silently merges or duplicates rows in a live blotter.
 */

afterEach(() => __resetPathAccessorCaches());

describe('normalizeKeyColumns', () => {
  it('wraps a single string column', () => {
    expect(normalizeKeyColumns('id')).toEqual(['id']);
  });

  it('trims whitespace', () => {
    expect(normalizeKeyColumns('  id  ')).toEqual(['id']);
  });

  it('keeps array order and drops blanks', () => {
    expect(normalizeKeyColumns(['a', '  ', 'b'])).toEqual(['a', 'b']);
  });

  it('drops non-string entries', () => {
    expect(normalizeKeyColumns(['a', 1, null, undefined, {}] as unknown as string[])).toEqual(['a']);
  });

  it('returns null for null/undefined', () => {
    expect(normalizeKeyColumns(null)).toBeNull();
    expect(normalizeKeyColumns(undefined)).toBeNull();
  });

  it('returns null when nothing usable survives', () => {
    expect(normalizeKeyColumns('   ')).toBeNull();
    expect(normalizeKeyColumns([])).toBeNull();
    expect(normalizeKeyColumns(['', '  '])).toBeNull();
  });

  it('returns null for a non-string, non-array input', () => {
    expect(normalizeKeyColumns(42 as unknown as string)).toBeNull();
  });

  it('memoises string input — same reference on repeat calls', () => {
    expect(normalizeKeyColumns('memo-me')).toBe(normalizeKeyColumns('memo-me'));
  });

  it('memoises array input by reference', () => {
    const cols = ['a', 'b'];
    expect(normalizeKeyColumns(cols)).toBe(normalizeKeyColumns(cols));
  });

  it('still returns correct results past the string cache cap', () => {
    // The cap clears the whole map; correctness must not depend on cache state.
    for (let i = 0; i < 1100; i += 1) normalizeKeyColumns(`col-${i}`);
    expect(normalizeKeyColumns('col-5')).toEqual(['col-5']);
    expect(normalizeKeyColumns('  spaced  ')).toEqual(['spaced']);
  });
});

describe('getValueByPath', () => {
  it('reads a flat property', () => {
    expect(getValueByPath({ id: 7 }, 'id')).toBe(7);
  });

  it('walks nested paths', () => {
    expect(getValueByPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1);
  });

  it('prefers literal flat keys', () => {
    expect(getValueByPath({ 'weird.key': 42 }, 'weird.key')).toBe(42);
  });

  it('prefers a literal dotted key over traversal when both exist', () => {
    expect(getValueByPath({ 'a.b': 'literal', a: { b: 'nested' } }, 'a.b')).toBe('literal');
  });

  it('returns undefined for a missing flat key', () => {
    expect(getValueByPath({ id: 1 }, 'nope')).toBeUndefined();
  });

  it('returns undefined when the path breaks midway', () => {
    expect(getValueByPath({ a: { b: 1 } }, 'a.b.c')).toBeUndefined();
    expect(getValueByPath({ a: null }, 'a.b')).toBeUndefined();
  });

  it('returns undefined for non-object rows', () => {
    for (const row of [null, undefined, 4, 'str']) {
      expect(getValueByPath(row, 'a')).toBeUndefined();
    }
  });

  it('preserves falsy values rather than treating them as missing', () => {
    expect(getValueByPath({ v: 0 }, 'v')).toBe(0);
    expect(getValueByPath({ v: '' }, 'v')).toBe('');
    expect(getValueByPath({ v: false }, 'v')).toBe(false);
  });
});

describe('composeRowId', () => {
  it('returns the single key value as a string', () => {
    expect(composeRowId({ id: 42 }, 'id')).toBe('42');
  });

  it('composes composite keys', () => {
    expect(composeRowId({ a: 'X', b: 'Y' }, ['a', 'b'])).toBe('X-Y');
  });

  it('joins with the exported separator', () => {
    expect(composeRowId({ a: 1, b: 2 }, ['a', 'b'])).toBe(`1${COMPOSITE_KEY_SEPARATOR}2`);
  });

  it('resolves nested key columns', () => {
    expect(composeRowId({ t: { id: 'x' } }, 't.id')).toBe('x');
  });

  it('returns null when the single key is null or undefined', () => {
    expect(composeRowId({ id: null }, 'id')).toBeNull();
    expect(composeRowId({}, 'id')).toBeNull();
  });

  it('returns null when any part is missing', () => {
    // Partial ids would collide across rows, so the whole id is refused.
    expect(composeRowId({ a: 'X' }, ['a', 'b'])).toBeNull();
    expect(composeRowId({ a: 1, b: null }, ['a', 'b'])).toBeNull();
  });

  it('returns null without a usable key column', () => {
    expect(composeRowId({ id: 1 }, null)).toBeNull();
    expect(composeRowId({ id: 1 }, [])).toBeNull();
  });

  it('returns null for a non-object row', () => {
    expect(composeRowId(null, 'id')).toBeNull();
    expect(composeRowId('row', 'id')).toBeNull();
  });

  it('keeps falsy-but-present values', () => {
    expect(composeRowId({ id: 0 }, 'id')).toBe('0');
    expect(composeRowId({ id: false }, 'id')).toBe('false');
  });
});

describe('getPathAccessor', () => {
  it('reads a flat property', () => {
    expect(getPathAccessor('id')({ id: 5 })).toBe(5);
  });

  it('reads a nested property', () => {
    expect(getPathAccessor('a.b')({ a: { b: 9 } })).toBe(9);
  });

  it('prefers a literal dotted key', () => {
    expect(getPathAccessor('a.b')({ 'a.b': 'literal', a: { b: 'nested' } })).toBe('literal');
  });

  it('returns the same function for a repeated path', () => {
    expect(getPathAccessor('cached.path')).toBe(getPathAccessor('cached.path'));
  });

  it('returns undefined for non-object rows and broken paths', () => {
    expect(getPathAccessor('a')(null)).toBeUndefined();
    expect(getPathAccessor('a.b')(5)).toBeUndefined();
    expect(getPathAccessor('a.b.c')({ a: { b: 1 } })).toBeUndefined();
  });

  it('rebuilds after a cache reset', () => {
    const before = getPathAccessor('x');
    __resetPathAccessorCaches();
    expect(getPathAccessor('x')).not.toBe(before);
  });
});

describe('getPathSetter', () => {
  it('sets a flat property and reports the change', () => {
    const row: Record<string, unknown> = { v: 1 };
    expect(getPathSetter('v')(row, 2)).toBe(true);
    expect(row.v).toBe(2);
  });

  it('returns false and leaves the row alone when the value is unchanged', () => {
    // The return value drives change detection — a false positive re-renders
    // the grid on every tick.
    const row = { v: 1 };
    expect(getPathSetter('v')(row, 1)).toBe(false);
  });

  it('treats NaN as unchanged via Object.is', () => {
    expect(getPathSetter('v')({ v: NaN }, NaN)).toBe(false);
  });

  it('distinguishes +0 from -0 via Object.is', () => {
    expect(getPathSetter('v')({ v: 0 }, -0)).toBe(true);
  });

  it('sets a nested property', () => {
    const row = { a: { b: 1 } };
    expect(getPathSetter('a.b')(row, 2)).toBe(true);
    expect(row.a.b).toBe(2);
  });

  it('creates missing intermediate objects', () => {
    const row: Record<string, unknown> = {};
    expect(getPathSetter('a.b.c')(row, 'deep')).toBe(true);
    expect(row).toEqual({ a: { b: { c: 'deep' } } });
  });

  it('replaces a non-object intermediate', () => {
    const row: Record<string, unknown> = { a: 5 };
    expect(getPathSetter('a.b')(row, 1)).toBe(true);
    expect(row.a).toEqual({ b: 1 });
  });

  it('returns false for a non-object row', () => {
    expect(getPathSetter('a')(null, 1)).toBe(false);
    expect(getPathSetter('a.b')(7, 1)).toBe(false);
  });

  it('returns the same function for a repeated path', () => {
    expect(getPathSetter('same.path')).toBe(getPathSetter('same.path'));
  });

  it('reports no change for an unchanged nested value', () => {
    expect(getPathSetter('a.b')({ a: { b: 3 } }, 3)).toBe(false);
  });
});
