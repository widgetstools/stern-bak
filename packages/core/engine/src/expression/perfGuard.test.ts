/**
 * Performance REGRESSION GUARDS for the expression hot path.
 *
 * This whole optimization pass started because expression evaluation silently
 * regressed (a re-parse-per-cell crept in, taking a conditional-styling frame
 * from ~3ms to ~23ms) and nobody noticed for many releases. These guards lock
 * the optimizations in place so the same class of regression fails CI.
 *
 * Design: assert INVARIANTS (deterministic, never timing-flaky) plus one
 * machine-INDEPENDENT ratio (cache-hit vs cache-miss). We deliberately avoid
 * absolute-millisecond budgets — those flake on shared/slow CI runners.
 */
import { describe, it, expect } from 'vitest';
import { ExpressionEngine } from './index';
import type { EvaluationContext } from './types';

const CTX: EvaluationContext = {
  x: null,
  value: null,
  data: { spread: -7, qty: 2000 },
  columns: { price: { old: 100, new: 105 }, spread: -7, qty: 2000 },
};

const COMPLEX = '[price.old] < [price.new] && ABS([spread]) > 5 || [qty] > 1000';

describe('expression perf guards', () => {
  it('parse() memoizes the AST (no re-tokenize/re-parse on repeat) — THE regression guard', () => {
    const engine = new ExpressionEngine();
    const a = engine.parse(COMPLEX);
    const b = engine.parse(COMPLEX);
    // Same instance ⇒ the parse cache is active. If a future change drops the
    // cache (the original regression), these become distinct objects.
    expect(b).toBe(a);
  });

  it('compile() memoizes the closure', () => {
    const engine = new ExpressionEngine();
    expect(engine.compile(COMPLEX)).toBe(engine.compile(COMPLEX));
  });

  it('parse cache is BOUNDED (evicts old entries — no unbounded growth)', () => {
    const engine = new ExpressionEngine();
    const first = engine.parse('[col_0] > 0');
    // Push well past the cache bound with distinct sources.
    for (let i = 1; i <= 1500; i++) engine.parse(`[col_${i}] > 0`);
    // The original entry was evicted ⇒ re-parsed to a fresh instance.
    expect(engine.parse('[col_0] > 0')).not.toBe(first);
  });

  it('cache-hit evaluation is materially faster than cache-miss (cache delivers a real speedup)', () => {
    const engine = new ExpressionEngine();
    const N = 4000;

    const time = (fn: () => void) => {
      // warmup (prime JIT) + median of 5 to damp noise
      fn();
      const runs: number[] = [];
      for (let r = 0; r < 5; r++) {
        const t0 = performance.now();
        fn();
        runs.push(performance.now() - t0);
      }
      runs.sort((p, q) => p - q);
      return runs[2];
    };

    // Cache HIT: same source every call ⇒ parse once, evaluate N times.
    const hit = time(() => {
      for (let i = 0; i < N; i++) engine.parseAndEvaluate(COMPLEX, CTX);
    });
    // Cache MISS: structurally identical but a fresh source string each call ⇒
    // re-tokenize+re-parse every call (same eval cost, so the delta is parsing).
    const miss = time(() => {
      for (let i = 0; i < N; i++) engine.parseAndEvaluate(`[price.old] < [price.new] && ABS([spread]) > ${i}`, CTX);
    });

    // Ratio is machine-independent (both scale with CPU speed). Healthy is ~4–7x;
    // a broken/removed cache collapses this toward 1. >1.5 catches breakage with
    // wide headroom against CI variance.
    expect(miss / hit).toBeGreaterThan(1.5);
  });
});
