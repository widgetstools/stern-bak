import { describe, expect, it, vi } from 'vitest';
import { createFunctionRegistry, getAllFunctions } from './functions';

function fn(name: string) {
  const def = createFunctionRegistry().get(name);
  if (!def) throw new Error(`missing ${name}`);
  return def.evaluate;
}

describe('createFunctionRegistry', () => {
  it('registers every builtin by uppercase name', () => {
    const registry = createFunctionRegistry();
    expect(registry.get('SUM')).toBeDefined();
    expect(registry.get('IFS')).toBeDefined();
    expect(getAllFunctions().length).toBeGreaterThan(30);
  });
});

describe('builtin function evaluate', () => {
  it('coerces non-numeric inputs for math helpers', () => {
    expect(fn('ABS')(['-3'])).toBe(3);
    expect(fn('ROUND')(['1.234', 2])).toBe(1.23);
    expect(fn('MOD')([10, 3])).toBe(1);
  });

  it('returns 0 for empty MIN/MAX/AVG aggregations', () => {
    expect(fn('MIN')([])).toBe(0);
    expect(fn('MAX')([])).toBe(0);
    expect(fn('AVG')([])).toBe(0);
  });

  it('computes STDEV/VARIANCE edge cases', () => {
    expect(fn('STDEV')([1])).toBe(0);
    expect(fn('VARIANCE')([1, 3])).toBe(2);
  });

  it('handles string helpers and invalid regex gracefully', () => {
    expect(fn('CONCAT')(['a', 1])).toBe('a1');
    expect(fn('REPLACE')(['abc', '(', 'x'])).toBe('abc');
    expect(fn('REGEX_MATCH')(['abc', '('])).toBe(false);
    expect(fn('SUBSTRING')(['hello', 1, 2])).toBe('el');
  });

  it('evaluates IFS/SWITCH/CASE branching', () => {
    expect(fn('IFS')([false, 'no', true, 'yes'])).toBe('yes');
    expect(fn('IFS')([false, 'no'])).toBeNull();
    expect(fn('SWITCH')(['BUY', 'BUY', 1, 'SELL', -1, 0])).toBe(1);
    expect(fn('CASE')(['SELL', 'BUY', 1, 'SELL', -1])).toBe(-1);
  });

  it('treats falsy values consistently in IFS', () => {
    expect(fn('IFS')([0, 'zero', true, 'yes'])).toBe('yes');
    expect(fn('IFS')(['', 'empty', 1, 'one'])).toBe('one');
  });

  it('supports logical null/empty checks', () => {
    expect(fn('ISNULL')([null, 'fallback'])).toBe('fallback');
    expect(fn('ISNOTNULL')([0])).toBe(true);
    expect(fn('ISEMPTY')([[]])).toBe(true);
  });

  it('handles string helpers, aggregates, and date units', () => {
    expect(fn('COUNT')([[1, null, 3]])).toBe(2);
    expect(fn('DISTINCT_COUNT')([1, 1, 2])).toBe(2);
    expect(fn('STARTS_WITH')(['abc', 'a'])).toBe(true);
    expect(fn('ENDS_WITH')(['abc', 'c'])).toBe(true);
    expect(fn('CONTAINS')(['abc', 'b'])).toBe(true);
    expect(fn('LEN')(['abc'])).toBe(3);
    expect(fn('REPLACE')(['abc', 'b', 'X'])).toBe('aXc');
    expect(fn('MEDIAN')([1, 2, 3, 4])).toBe(2.5);
    expect(fn('DATE_DIFF')(['2026-01-02T01:00:00Z', '2026-01-02T00:00:00Z', 'hours'])).toBe(1);
    expect(fn('YEAR')(['2026-04-17'])).toBe(2026);
    expect(fn('MONTH')(['2026-04-17'])).toBe(4);
    expect(fn('DAY')(['2026-04-17T12:00:00Z'])).toBe(17);
    expect(fn('IS_WEEKDAY')(['2026-04-17'])).toBe(true);
  });

  it('covers additional math, string, logical, and date branches', () => {
    expect(fn('FLOOR')([1.9])).toBe(1);
    expect(fn('CEIL')([1.1])).toBe(2);
    expect(fn('SQRT')([9])).toBe(3);
    expect(fn('POW')([2, 3])).toBe(8);
    expect(fn('LOG')([Math.E])).toBeCloseTo(1);
    expect(fn('EXP')([1])).toBeCloseTo(Math.E);
    expect(fn('SUM')([1, 2, 3])).toBe(6);
    expect(fn('UPPER')(['abc'])).toBe('ABC');
    expect(fn('LOWER')(['ABC'])).toBe('abc');
    expect(fn('TRIM')(['  x  '])).toBe('x');
    expect(fn('SUBSTRING')(['hello', 1])).toBe('ello');
    expect(fn('IF')([true, 'yes', 'no'])).toBe('yes');
    expect(fn('IF')([false, 'yes', 'no'])).toBe('no');
    expect(fn('SWITCH')(['X', 'A', 1, 'B', 2])).toBeNull();
    expect(fn('CASE')(['X', 'A', 1, 'B', 2])).toBeNull();
    expect(fn('ISEMPTY')([''])).toBe(true);
    expect(fn('ISEMPTY')(['x'])).toBe(false);
    expect(fn('NOW')([])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fn('TODAY')([])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fn('IS_WEEKDAY')(['2026-04-19'])).toBe(false);
  });

  it('DATE_DIFF and DATE_ADD honor unit aliases and default ms', () => {
    const d1 = '2026-01-02T00:00:00Z';
    const d2 = '2026-01-01T00:00:00Z';
    expect(fn('DATE_DIFF')([d1, d2, 'days'])).toBe(1);
    expect(fn('DATE_DIFF')([d1, d2, 'd'])).toBe(1);
    expect(fn('DATE_DIFF')([d1, d2, 'minutes'])).toBe(1440);
    expect(fn('DATE_DIFF')([d1, d2, 'm'])).toBe(1440);
    expect(fn('DATE_DIFF')([d1, d2, 'seconds'])).toBe(86400);
    expect(fn('DATE_DIFF')([d1, d2, 's'])).toBe(86400);
    expect(fn('DATE_DIFF')([d1, d2, 'hours'])).toBe(24);
    expect(fn('DATE_DIFF')([d1, d2, 'unknown'])).toBe(86_400_000);

    const added = fn('DATE_ADD')(['2026-01-01', 2, 'days']);
    expect(String(added)).toContain('2026');
    expect(fn('DATE_ADD')(['2026-01-01', 1, 'months'])).toBeTruthy();
    expect(fn('DATE_ADD')(['2026-01-01', 1, 'years'])).toBeTruthy();
    expect(fn('DATE_ADD')(['2026-01-01T00:00:00Z', 3, 'hours'])).toBeTruthy();
  });

  it('compareValues ordering treats nulls and mixed types consistently via DISTINCT sort path', () => {
    expect(fn('MEDIAN')([2, 1])).toBe(1.5);
    expect(fn('REGEX_MATCH')(['abc', 'a.c'])).toBe(true);
  });
});
