import { describe, expect, it } from 'vitest';
import {
  defaultFunctionsProvider,
  findUnclosedBracket,
  OPERATORS_AND_KEYWORDS,
} from './completionCatalog.js';

describe('completionCatalog', () => {
  it('exports operator catalogue entries', () => {
    expect(OPERATORS_AND_KEYWORDS.some((op) => op.label === 'AND')).toBe(true);
    expect(OPERATORS_AND_KEYWORDS.some((op) => op.snippet === true)).toBe(true);
  });

  describe('findUnclosedBracket', () => {
    it('returns null for balanced brackets', () => {
      expect(findUnclosedBracket('[a, b]')).toBeNull();
      expect(findUnclosedBracket('{a: 1}')).toBeNull();
    });

    it('detects unclosed array bracket', () => {
      expect(findUnclosedBracket('IN [a, b')).toBe('[');
    });

    it('detects unclosed object brace', () => {
      expect(findUnclosedBracket('{a: 1')).toBe('{');
    });

    it('ignores brackets inside string literals', () => {
      expect(findUnclosedBracket('"text with ["')).toBeNull();
      expect(findUnclosedBracket("'brace { inside'")).toBeNull();
    });

    it('handles escaped quotes inside strings', () => {
      expect(findUnclosedBracket('"say \\"hi\\""')).toBeNull();
    });

    it('pops matching closing brackets', () => {
      expect(findUnclosedBracket('[a]')).toBeNull();
      expect(findUnclosedBracket('{a}')).toBeNull();
    });
  });

  describe('defaultFunctionsProvider', () => {
    it('returns expression engine functions', () => {
      const fns = defaultFunctionsProvider();
      expect(fns.length).toBeGreaterThan(0);
      expect(fns[0]).toMatchObject({
        name: expect.any(String),
        category: expect.any(String),
        signature: expect.any(String),
        description: expect.any(String),
      });
    });

    it('reuses cached engine instance', () => {
      const first = defaultFunctionsProvider();
      const second = defaultFunctionsProvider();
      expect(second.map((f) => f.name)).toEqual(first.map((f) => f.name));
    });
  });
});
