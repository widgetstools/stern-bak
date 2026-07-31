import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from './index';
import type { EvaluationContext } from './types';

/**
 * Parity contract: a compiled expression MUST produce the exact same result as
 * the interpreter for every expression × context. This is the safety net that
 * lets call sites swap `parseAndEvaluate` for `compile()` without behaviour
 * risk; if `evalOps` and the compiler ever drift, these break.
 */

const engine = new ExpressionEngine();

const CONTEXTS: EvaluationContext[] = [
  {
    x: 105,
    value: 105,
    data: { price: 105, qty: 2000, spread: -7, name: 'UST', ratings: { sp: 'AA' } },
    columns: { price: { old: 100, new: 105 }, spread: -7, qty: 2000 },
    oldValue: 100,
    newValue: 105,
  },
  {
    x: 0,
    value: 0,
    data: { price: 0, qty: 0, spread: 0, name: '', ratings: { sp: 'BBB' } },
    columns: { price: { old: 50, new: 50 }, spread: 0, qty: 0 },
    oldValue: 50,
    newValue: 50,
  },
  {
    x: null,
    value: null,
    data: { price: 9999, qty: 10, spread: 12.5, name: 'GILT', ratings: {} },
    columns: { price: { old: 200, new: 150 }, spread: 12.5, qty: 10 },
  },
];

const EXPRESSIONS: string[] = [
  // comparisons + arithmetic
  '[price] > 100',
  '[price] >= 100 && [qty] < 5000',
  '[price] * 2 - [qty] / 10',
  '[spread] % 3',
  '-[spread]',
  // string
  '[name] == "UST"',
  '[name] + "_suffix"',
  'CONTAINS([name], "S")',
  // logical short-circuit (truthiness varies by context)
  '[qty] > 1000 || [price] > 1000000',
  '[price] > 0 && [name]',
  'NOT ([qty] > 1000)',
  // ternary (both branches, incl. an unknown-function branch that must NOT throw when not taken)
  '[qty] > 1000 ? [price] * 2 : [price]',
  '[price] > 1000000 ? NOPE([price]) : [price]',
  // diff refs + nested members
  '[price.old] < [price.new]',
  '[ratings.sp] == "AA"',
  // functions
  'ABS([spread]) > 5',
  'ROUND([spread], 0)',
  'MAX([price], [qty])',
  'IF([qty] > 1000, "big", "small")',
  // operators IN / BETWEEN
  '[name] IN ["UST", "GILT"]',
  '[price] BETWEEN [price] AND 99999',
  // division-by-zero → null
  '[price] / [qty]',
  // array literal
  '[1, 2, 3]',
];

describe('compile() parity with the interpreter', () => {
  for (const expr of EXPRESSIONS) {
    it(`matches for: ${expr}`, () => {
      const compiled = engine.compile(expr);
      for (const ctx of CONTEXTS) {
        const interpreted = engine.parseAndEvaluate(expr, ctx);
        const compiledResult = compiled(ctx);
        expect(compiledResult).toStrictEqual(interpreted);
      }
    });
  }

  it('caches compiled closures (same instance for same source)', () => {
    expect(engine.compile('[price] > 100')).toBe(engine.compile('[price] > 100'));
  });

  it('throws Unknown function only when the call is actually reached', () => {
    const compiled = engine.compile('[price] > 1000000 ? NOPE([price]) : [price]');
    // price never exceeds 1_000_000 in CONTEXTS → NOPE branch not taken → no throw.
    for (const ctx of CONTEXTS) expect(() => compiled(ctx)).not.toThrow();
    // Force the branch: it must throw, same as the interpreter.
    const hot: EvaluationContext = { x: null, value: null, data: { price: 2_000_000 }, columns: {} };
    expect(() => compiled(hot)).toThrow(/Unknown function/);
    expect(() => engine.parseAndEvaluate('[price] > 1000000 ? NOPE([price]) : [price]', hot)).toThrow(/Unknown function/);
  });
});
