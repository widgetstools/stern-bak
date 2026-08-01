/**
 * Grid-scale benchmark — models the per-frame cost of conditional-styling
 * cellClassRules on a config-heavy grid.
 *
 * A conditional-styling-heavy grid runs a rule predicate for every visible
 * cell it applies to, on every paint. With ~200 columns and ~40 visible rows
 * that is thousands of predicate evaluations per frame. Today each one
 * re-tokenizes + re-parses the rule string (`parseAndEvaluate`). This bench
 * reports the total time for ONE such frame across the three lanes, so the
 * frame-budget impact (16ms target) of the parse cache / closure compile is
 * directly visible.
 */
import { bench, describe } from 'vitest';
import { ExpressionEngine } from './index';
import type { EvaluationContext } from './types';

const engine = new ExpressionEngine();

const COLS = 200;
const VISIBLE_ROWS = 40;
// Non-AG-compilable predicate (diff ref) — the path that falls through to the
// per-cell function form, i.e. the expensive case the user actually hits.
const EXPR = '[price.old] < [price.new] && ABS([spread]) > 5';
const EVALS = COLS * VISIBLE_ROWS; // ~8000 predicate evaluations per frame

// One representative context per row; reused across columns (the predicate is
// row-scoped in the diff case).
const CONTEXTS: EvaluationContext[] = [];
for (let r = 0; r < VISIBLE_ROWS; r++) {
  CONTEXTS.push({
    x: null,
    value: null,
    data: { spread: (r % 11) - 5 },
    columns: { price: { old: 100 + (r % 7), new: 100 + (r % 9) }, spread: (r % 11) - 5 },
  });
}

const ast = engine.parse(EXPR);
const compiled =
  typeof (engine as { compile?: (s: string) => (ctx: EvaluationContext) => unknown }).compile === 'function'
    ? (engine as unknown as { compile: (s: string) => (ctx: EvaluationContext) => unknown }).compile(EXPR)
    : null;

describe(`one frame · ${COLS} cols × ${VISIBLE_ROWS} rows = ${EVALS} evals`, () => {
  bench('parseAndEvaluate (today)', () => {
    for (let i = 0; i < EVALS; i++) engine.parseAndEvaluate(EXPR, CONTEXTS[i % VISIBLE_ROWS]);
  });
  bench('evaluate (parse cached)', () => {
    for (let i = 0; i < EVALS; i++) engine.evaluate(ast, CONTEXTS[i % VISIBLE_ROWS]);
  });
  if (compiled) {
    bench('compile (closure)', () => {
      for (let i = 0; i < EVALS; i++) compiled(CONTEXTS[i % VISIBLE_ROWS]);
    });
  }
});
