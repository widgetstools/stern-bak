import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from './index';
import { astUsesAggregateFunctions } from './usesAggregates';

const engine = new ExpressionEngine();

describe('astUsesAggregateFunctions', () => {
  it('detects a direct aggregate call', () => {
    expect(astUsesAggregateFunctions(engine.parse('SUM([price])'))).toBe(true);
  });

  it('detects an aggregate nested inside operators and ternaries', () => {
    expect(
      astUsesAggregateFunctions(
        engine.parse('[qty] > 0 ? AVG([yield]) / 100 : 0'),
      ),
    ).toBe(true);
  });

  it('detects an aggregate nested inside a non-aggregate call', () => {
    expect(
      astUsesAggregateFunctions(engine.parse('ROUND(SUM([notional]), 2)')),
    ).toBe(true);
  });

  it('matches case-insensitively like the evaluator lookup', () => {
    expect(astUsesAggregateFunctions(engine.parse('sum([price])'))).toBe(true);
  });

  it('returns false for row-local expressions', () => {
    expect(astUsesAggregateFunctions(engine.parse('[price] * [qty]'))).toBe(false);
    expect(
      astUsesAggregateFunctions(engine.parse('ROUND([price], 2) + ABS([qty])')),
    ).toBe(false);
  });

  it('returns false for non-AST input', () => {
    expect(astUsesAggregateFunctions(null)).toBe(false);
    expect(astUsesAggregateFunctions(undefined)).toBe(false);
    expect(astUsesAggregateFunctions('SUM([price])')).toBe(false);
  });
});

describe('allRowsColumnCache', () => {
  it('reuses the memoized column array instead of re-mapping allRows', () => {
    const allRows = [{ price: 1 }, { price: 2 }, { price: 3 }];
    const cache = new Map<string, unknown[]>();
    const ctx = { x: null, value: null, data: {}, columns: {}, allRows, allRowsColumnCache: cache };

    expect(engine.parseAndEvaluate('SUM([price])', ctx)).toBe(6);
    expect(cache.get('price')).toEqual([1, 2, 3]);

    // Mutate the underlying rows WITHOUT clearing the cache: a cache hit
    // must serve the memoized array (this is what makes 20k rendered
    // cells map the snapshot once instead of once each).
    allRows[0].price = 100;
    expect(engine.parseAndEvaluate('SUM([price])', ctx)).toBe(6);

    // Clearing the cache — what invalidateAllRowsCache does — re-maps.
    cache.clear();
    expect(engine.parseAndEvaluate('SUM([price])', ctx)).toBe(105);
  });

  it('still aggregates correctly when no cache is supplied', () => {
    const ctx = {
      x: null,
      value: null,
      data: {},
      columns: {},
      allRows: [{ price: 1 }, { price: 2 }],
    };
    expect(engine.parseAndEvaluate('SUM([price])', ctx)).toBe(3);
  });
});
