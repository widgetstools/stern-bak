import { describe, expect, it } from 'vitest';
import {
  FieldPathError,
  appendFieldPath,
  fieldPathLeafName,
  fieldPathSegments,
  formatFieldPath,
  isFieldPathPrefix,
  parseFieldPath,
  tryParseFieldPath,
} from './fieldPath.js';

describe('parseFieldPath', () => {
  it('parses dotted keys', () => {
    expect(parseFieldPath('a')).toEqual(['a']);
    expect(parseFieldPath('a.b.c')).toEqual(['a', 'b', 'c']);
  });

  it('parses array indices as number segments', () => {
    expect(parseFieldPath('legs[0].rate')).toEqual(['legs', 0, 'rate']);
    expect(parseFieldPath('m[1][2]')).toEqual(['m', 1, 2]);
    expect(parseFieldPath('[0]')).toEqual([0]);
    expect(parseFieldPath('a[007]')).toEqual(['a', 7]);
  });

  it('parses bracket-quoted keys with escapes (double or single quotes)', () => {
    expect(parseFieldPath('["a.b"].c')).toEqual(['a.b', 'c']);
    expect(parseFieldPath("x['we\"ird[]']")).toEqual(['x', 'we"ird[]']);
    expect(parseFieldPath('["q\\"uote\\\\"]')).toEqual(['q"uote\\']);
  });

  it('treats commas and spaces as ordinary key characters (the x,y.z[0].abc case)', () => {
    expect(parseFieldPath('x,y.z[0].abc')).toEqual(['x,y', 'z', 0, 'abc']);
    expect(parseFieldPath('trade id.px')).toEqual(['trade id', 'px']);
  });

  it('addresses object member "0" and array index 0 differently', () => {
    expect(parseFieldPath('a.0')).toEqual(['a', '0']);
    expect(parseFieldPath('a[0]')).toEqual(['a', 0]);
  });

  it.each([
    ['', 'empty path'],
    ['.a', 'empty key'],
    ['a.', 'empty key'],
    ['a..b', 'empty key'],
    ['a.[0]', 'expected a key'],
    ['a[x]', 'expected an index'],
    ['a[0', 'expected "]"'],
    ['a[', 'unterminated'],
    ['a["b]', 'unterminated quoted'],
    ['a["b"', 'expected "]"'],
    ['a]', 'must be inside'],
    ['a"b', 'must be inside'],
    ['a\\b', 'must be inside'],
    ['a[0]b', 'expected "." or "["'],
  ])('rejects %j (%s)', (path, detail) => {
    expect(() => parseFieldPath(path)).toThrow(FieldPathError);
    expect(() => parseFieldPath(path)).toThrow(detail);
    expect(tryParseFieldPath(path)).toBeNull();
  });

  it('reports the failing offset', () => {
    try {
      parseFieldPath('a..b');
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(FieldPathError);
      expect((e as FieldPathError).index).toBe(2);
      expect((e as FieldPathError).path).toBe('a..b');
    }
  });
});

describe('formatFieldPath / appendFieldPath', () => {
  it('renders canonical form and round-trips', () => {
    const cases: ReadonlyArray<ReadonlyArray<string | number>> = [
      ['a'],
      ['a', 'b'],
      ['legs', 0, 'rate'],
      ['a.b', 'c'],
      ['x,y', 'z', 0, 'abc'],
      [0, 'k'],
      ['', 'e'],
      ['q"', 'z'],
    ];
    for (const segs of cases) {
      expect(parseFieldPath(formatFieldPath(segs))).toEqual([...segs]);
    }
    expect(formatFieldPath(['legs', 0, 'rate'])).toBe('legs[0].rate');
    expect(formatFieldPath(['a.b', 'c'])).toBe('["a.b"].c');
    expect(formatFieldPath(['x,y', 'z', 0, 'abc'])).toBe('x,y.z[0].abc');
    expect(formatFieldPath(['', 'e'])).toBe('[""].e');
  });

  it('canonicalises non-canonical spellings', () => {
    expect(formatFieldPath(parseFieldPath("a['b'][00]"))).toBe('a.b[0]');
  });

  it('appends a child segment', () => {
    expect(appendFieldPath('', 'a')).toBe('a');
    expect(appendFieldPath('', 'a.b')).toBe('["a.b"]');
    expect(appendFieldPath('legs', 0)).toBe('legs[0]');
    expect(appendFieldPath('legs[0]', 'rate')).toBe('legs[0].rate');
    expect(appendFieldPath('m', 'we[ird')).toBe('m["we[ird"]');
  });
});

describe('fieldPathLeafName', () => {
  it('returns the raw last key, [n] for an index, or the path itself when unparsable', () => {
    expect(fieldPathLeafName('x,y.z[0].abc')).toBe('abc');
    expect(fieldPathLeafName('legs[1]')).toBe('[1]');
    expect(fieldPathLeafName('["a.b"]')).toBe('a.b');
    expect(fieldPathLeafName('a..b')).toBe('a..b');
  });
});

describe('isFieldPathPrefix', () => {
  it('compares segment-wise (so "ab" is not a prefix of "abc")', () => {
    expect(isFieldPathPrefix(['a'], ['a', 'b'])).toBe(true);
    expect(isFieldPathPrefix(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(isFieldPathPrefix(['ab'], ['abc'])).toBe(false);
    expect(isFieldPathPrefix(['a', 0], ['a', '0'])).toBe(false);
    expect(isFieldPathPrefix(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
  });
});

describe('fieldPathSegments (memoised, tolerant)', () => {
  it('returns the same array for the same path and falls back to one literal key', () => {
    expect(fieldPathSegments('a[0].b')).toBe(fieldPathSegments('a[0].b'));
    expect(fieldPathSegments('a[0].b')).toEqual(['a', 0, 'b']);
    expect(fieldPathSegments('foo[bar')).toEqual(['foo[bar']);
  });
});
