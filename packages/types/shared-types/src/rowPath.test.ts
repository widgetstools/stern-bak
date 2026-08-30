import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetPathAccessorCaches,
  composeRowId,
  getPathAccessor,
  getPathSetter,
  getValueByPath,
} from './rowPath.js';

/**
 * Grammar-aware behaviour of the consolidated accessors (`legs[0].rate`,
 * `["a.b"]`, flat-key-first). The dotted / memoisation behaviour is
 * covered by `dataProvider.test.ts` and `types/src/rowPath.test.ts`.
 */

afterEach(() => __resetPathAccessorCaches());

const row = {
  id: 'r1',
  legs: [{ rate: 0.05 }, { rate: 0.03, schedule: { end: '2036' } }],
  m: [[1, 2], [3, 4]],
  'a.b': { c: 'lit' },
  a: { b: { c: 'walked' } },
  'legs[0].rate': 'flat-wins',
};

describe('getValueByPath (grammar)', () => {
  it('walks index segments', () => {
    expect(getValueByPath(row, 'legs[1].rate')).toBe(0.03);
    expect(getValueByPath(row, 'legs[1].schedule.end')).toBe('2036');
    expect(getValueByPath(row, 'm[1][0]')).toBe(3);
    expect(getValueByPath(row, 'legs[5].rate')).toBeUndefined();
  });

  it('prefers a literal flat key for the whole path, then walks', () => {
    expect(getValueByPath(row, 'legs[0].rate')).toBe('flat-wins');
    expect(getValueByPath(row, '["a.b"].c')).toBe('lit');
    expect(getValueByPath(row, 'a.b.c')).toBe('walked');
  });

  it('reads an unparsable path as one literal key', () => {
    expect(getValueByPath({ 'foo[bar': 1 }, 'foo[bar')).toBe(1);
    expect(getValueByPath({ foo: { bar: 1 } }, 'foo[bar')).toBeUndefined();
  });
});

describe('getPathAccessor / getPathSetter (grammar)', () => {
  it('accessor matches getValueByPath and keeps identity', () => {
    const get = getPathAccessor('legs[1].schedule.end');
    expect(get(row)).toBe('2036');
    expect(get).toBe(getPathAccessor('legs[1].schedule.end'));
    expect(getPathAccessor('["a.b"].c')(row)).toBe('lit');
  });

  it('setter creates arrays before index segments and objects before keys', () => {
    const target: Record<string, unknown> = {};
    expect(getPathSetter('legs[1].rate')(target, 7)).toBe(true);
    expect(target).toEqual({ legs: [undefined, { rate: 7 }] });
    expect(Array.isArray(target.legs)).toBe(true);
    expect(getPathSetter('legs[1].rate')(target, 7)).toBe(false);
    expect(getPathSetter('["a.b"].c')(target, 1)).toBe(true);
    expect(target['a.b']).toEqual({ c: 1 });
  });
});

describe('composeRowId (grammar)', () => {
  it('derives ids through index paths and composite keys', () => {
    expect(composeRowId(row, 'legs[0].rate')).toBe('flat-wins');
    expect(composeRowId(row, ['id', 'legs[1].rate'])).toBe('r1-0.03');
    expect(composeRowId(row, 'legs[9].rate')).toBeNull();
  });
});
