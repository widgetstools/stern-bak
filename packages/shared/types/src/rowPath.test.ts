import { describe, expect, it } from 'vitest';
import { composeRowId, getValueByPath } from './rowPath.js';

describe('getValueByPath', () => {
  it('walks nested paths', () => {
    expect(getValueByPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1);
  });

  it('prefers literal flat keys', () => {
    expect(getValueByPath({ 'weird.key': 42 }, 'weird.key')).toBe(42);
  });
});

describe('composeRowId', () => {
  it('composes composite keys', () => {
    expect(composeRowId({ a: 'X', b: 'Y' }, ['a', 'b'])).toBe('X-Y');
  });

  it('returns null when any part is missing', () => {
    expect(composeRowId({ a: 'X' }, ['a', 'b'])).toBeNull();
  });
});
