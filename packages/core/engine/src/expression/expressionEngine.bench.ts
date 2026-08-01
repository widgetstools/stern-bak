/**
 * Microbenchmarks isolating the cost of "applying an expression" at runtime.
 *
 * Three lanes per expression:
 *   - parseAndEvaluate  — today's hot-path call (re-tokenize + re-parse + walk)
 *   - evaluate (cached) — parse ONCE up front, walk the AST per call
 *                         (== the win from an engine-level parse cache)
 *   - compile (closure) — compile ONCE to a closure, call per evaluation
 *                         (== the win from AST→closure codegen)
 *
 * The gap between lane 1 and lane 2 is wasted re-parsing; the gap between lane 2
 * and lane 3 is interpreter overhead. Run with `npm run bench` in this package.
 */
import { bench, describe } from 'vitest';
import { ExpressionEngine } from './index';
import type { EvaluationContext } from './types';

const engine = new ExpressionEngine();

interface Case {
  readonly name: string;
  readonly expr: string;
  readonly ctx: EvaluationContext;
}

const CASES: readonly Case[] = [
  {
    name: 'comparison',
    expr: '[price] > 100',
    ctx: { x: 105, value: 105, data: { price: 105 }, columns: { price: 105 } },
  },
  {
    name: 'diff-ref',
    expr: '[price.old] < [price.new]',
    ctx: { x: null, value: null, data: {}, columns: { price: { old: 100, new: 105 } } },
  },
  {
    name: 'function-call',
    expr: 'ABS([spread]) > 5',
    ctx: { x: -7, value: -7, data: { spread: -7 }, columns: { spread: -7 } },
  },
  {
    name: 'nested-member',
    expr: '[ratings.sp] == "AA"',
    ctx: { x: null, value: null, data: { ratings: { sp: 'AA' } }, columns: { ratings: { sp: 'AA' } } },
  },
  {
    name: 'ternary',
    expr: '[qty] > 1000 ? [price] * 2 : [price]',
    ctx: { x: null, value: null, data: { qty: 2000, price: 100 }, columns: { qty: 2000, price: 100 } },
  },
];

for (const c of CASES) {
  // Pre-parse once for the "cached parse" lane.
  const ast = engine.parse(c.expr);
  // compile() lands in Phase C — guard so the bench file runs before then.
  const compiled =
    typeof (engine as { compile?: (s: string) => (ctx: EvaluationContext) => unknown }).compile === 'function'
      ? (engine as unknown as { compile: (s: string) => (ctx: EvaluationContext) => unknown }).compile(c.expr)
      : null;

  describe(c.name, () => {
    bench('parseAndEvaluate', () => {
      engine.parseAndEvaluate(c.expr, c.ctx);
    });
    bench('evaluate (parse cached)', () => {
      engine.evaluate(ast, c.ctx);
    });
    if (compiled) {
      bench('compile (closure)', () => {
        compiled(c.ctx);
      });
    }
  });
}
