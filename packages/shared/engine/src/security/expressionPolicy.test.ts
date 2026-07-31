import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetExpressionPolicyForTests,
  configureExpressionPolicy,
  findExpressionFormatter,
  getExpressionPolicy,
  reportExpressionViolation,
  sanitizeExpressionFormatters,
} from './expressionPolicy';
import {
  __resetExpressionCacheForTests,
  valueFormatterFromTemplate,
} from '../colDef/adapters/valueFormatterFromTemplate';

describe('expressionPolicy — singleton', () => {
  afterEach(() => {
    __resetExpressionPolicyForTests();
  });

  it('defaults to allow mode with no observer', () => {
    expect(getExpressionPolicy()).toEqual({ mode: 'allow' });
  });

  it('configure merges partial updates', () => {
    const observer = vi.fn();
    configureExpressionPolicy({ mode: 'warn', onViolation: observer });
    configureExpressionPolicy({ mode: 'strict' });
    expect(getExpressionPolicy().mode).toBe('strict');
    // Observer was not clobbered.
    expect(getExpressionPolicy().onViolation).toBe(observer);
  });
});

describe('expressionPolicy — findExpressionFormatter', () => {
  it('returns null for primitives / null / undefined', () => {
    expect(findExpressionFormatter(null)).toBeNull();
    expect(findExpressionFormatter(42)).toBeNull();
    expect(findExpressionFormatter('string')).toBeNull();
    expect(findExpressionFormatter(undefined)).toBeNull();
  });

  it('finds a top-level expression-kind template', () => {
    expect(
      findExpressionFormatter({ kind: 'expression', expression: 'x+1' }),
    ).toBe('x+1');
  });

  it('finds a deeply nested expression template', () => {
    const state = {
      'column-customization': {
        v: 1,
        data: {
          assignments: {
            price: {
              colId: 'price',
              valueFormatterTemplate: { kind: 'expression', expression: 'x.toFixed(2)' },
            },
          },
        },
      },
    };
    expect(findExpressionFormatter(state)).toBe('x.toFixed(2)');
  });

  it('walks arrays', () => {
    const rules = [
      { id: 'a', valueFormatter: { kind: 'preset', preset: 'number' } },
      { id: 'b', valueFormatter: { kind: 'expression', expression: "x+'bp'" } },
    ];
    expect(findExpressionFormatter(rules)).toBe("x+'bp'");
  });

  it('returns null when every formatter is CSP-safe', () => {
    const safe = {
      assignments: {
        price: { valueFormatterTemplate: { kind: 'excelFormat', format: '#,##0' } },
        yield: { valueFormatterTemplate: { kind: 'preset', preset: 'percent' } },
      },
    };
    expect(findExpressionFormatter(safe)).toBeNull();
  });

  it('handles cyclic references without stack overflow', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    cyclic.inner = { kind: 'expression', expression: 'x' };
    expect(findExpressionFormatter(cyclic)).toBe('x');
  });

  it('ignores objects whose "kind" is not the string "expression"', () => {
    // e.g. an unrelated module storing { kind: 'rule', ... } shouldn't match.
    expect(findExpressionFormatter({ kind: 'rule', expression: 'x' })).toBeNull();
  });
});

describe('expressionPolicy — sanitizeExpressionFormatters', () => {
  it('rewrites every expression template to a safe preset', () => {
    const state = {
      a: { kind: 'expression', expression: 'x+1' },
      nested: [{ kind: 'expression', expression: "x?'Y':'N'" }],
      safe: { kind: 'preset', preset: 'number' },
    };
    const count = sanitizeExpressionFormatters(state);
    expect(count).toBe(2);
    expect(state.a).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 0 } });
    expect(state.nested[0]).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 0 } });
    // Safe template untouched.
    expect(state.safe).toEqual({ kind: 'preset', preset: 'number' });
  });

  it('returns 0 when nothing matches', () => {
    expect(sanitizeExpressionFormatters({ kind: 'preset', preset: 'percent' })).toBe(0);
  });
});

describe('expressionPolicy — reportExpressionViolation', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetExpressionPolicyForTests();
  });

  it('invokes onViolation in allow mode but does NOT console.warn', () => {
    const observer = vi.fn();
    configureExpressionPolicy({ mode: 'allow', onViolation: observer });
    reportExpressionViolation({ kind: 'valueFormatter', expression: 'x', reason: 'r' });
    expect(observer).toHaveBeenCalledOnce();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits a one-shot warn per expression under warn mode', () => {
    configureExpressionPolicy({ mode: 'warn' });
    reportExpressionViolation({ kind: 'valueFormatter', expression: 'sameExpr', reason: 'r' });
    reportExpressionViolation({ kind: 'valueFormatter', expression: 'sameExpr', reason: 'r' });
    reportExpressionViolation({ kind: 'valueFormatter', expression: 'otherExpr', reason: 'r' });
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('swallows observer errors so the pipeline keeps flowing', () => {
    const observer = vi.fn(() => { throw new Error('observer blew up'); });
    configureExpressionPolicy({ mode: 'warn', onViolation: observer });
    expect(() =>
      reportExpressionViolation({ kind: 'valueFormatter', expression: 'x', reason: 'r' }),
    ).not.toThrow();
    expect(observer).toHaveBeenCalledOnce();
  });
});

describe('valueFormatterFromTemplate — policy integration', () => {
  beforeEach(() => {
    __resetExpressionPolicyForTests();
    __resetExpressionCacheForTests();
  });

  it('compiles expressions when policy is allow', () => {
    const fn = valueFormatterFromTemplate({ kind: 'expression', expression: "'v='+x" });
    expect(fn({ value: 7 })).toBe('v=7');
  });

  it('returns identity when policy is strict', () => {
    const observer = vi.fn();
    configureExpressionPolicy({ mode: 'strict', onViolation: observer });
    const fn = valueFormatterFromTemplate({ kind: 'expression', expression: "'v='+x" });
    expect(fn({ value: 7 })).toBe('7');
    expect(fn({ value: null })).toBe('');
    expect(observer).toHaveBeenCalledOnce();
    expect(observer.mock.calls[0][0]).toMatchObject({
      kind: 'valueFormatter',
      reason: expect.stringContaining('strict-mode'),
    });
  });

  it('still compiles under warn mode but invokes observer', () => {
    const observer = vi.fn();
    configureExpressionPolicy({ mode: 'warn', onViolation: observer });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fn = valueFormatterFromTemplate({ kind: 'expression', expression: "'v='+x" });
      expect(fn({ value: 7 })).toBe('v=7');
      expect(observer).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it('preset + excelFormat + tick remain unaffected under strict mode', () => {
    configureExpressionPolicy({ mode: 'strict' });
    const preset = valueFormatterFromTemplate({ kind: 'preset', preset: 'number' });
    expect(preset({ value: 1234 })).toBe('1,234');
    const excel = valueFormatterFromTemplate({ kind: 'excelFormat', format: '0.00' });
    expect(excel({ value: 3.1 })).toBe('3.10');
    const tick = valueFormatterFromTemplate({ kind: 'tick', tick: 'TICK32' });
    expect(tick({ value: 100.5 })).toBeTruthy();
  });
});
