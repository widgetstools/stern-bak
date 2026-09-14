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

describe('resolveAggregate', () => {
  const allRows = [{ price: 10 }, { price: 20 }];

  it('uses the resolver for SUM/COUNT and does not reduce allRows', () => {
    const resolveAggregate = (fn: string, columnId: string): unknown => {
      if (fn === 'SUM' && columnId === 'price') return 1000;
      if (fn === 'COUNT' && columnId === 'price') return 50;
      return undefined;
    };
    const ctx = {
      x: null,
      value: null,
      data: { price: 10 },
      columns: { price: 10 },
      allRows,
      resolveAggregate,
    };
    expect(engine.parseAndEvaluate('SUM([price])', ctx)).toBe(1000);
    expect(engine.parseAndEvaluate('COUNT([price])', ctx)).toBe(50);
    expect(engine.parseAndEvaluate('[price] / SUM([price])', ctx)).toBe(0.01);
    expect(engine.compile('SUM([price])')(ctx)).toBe(1000);
    expect(engine.compile('COUNT([price])')(ctx)).toBe(50);
  });

  it('treats a pending null as the result so allRows is not used', () => {
    const ctx = {
      x: null,
      value: null,
      data: { price: 10 },
      columns: {},
      allRows,
      resolveAggregate: () => null,
    };
    expect(engine.parseAndEvaluate('SUM([price])', ctx)).toBeNull();
    expect(engine.parseAndEvaluate('[price] / SUM([price])', ctx)).toBeNull();
  });

  it('falls through to allRows when the resolver returns undefined', () => {
    const ctx = {
      x: null,
      value: null,
      data: {},
      columns: {},
      allRows,
      resolveAggregate: () => undefined,
    };
    expect(engine.parseAndEvaluate('SUM([price])', ctx)).toBe(30);
    expect(engine.parseAndEvaluate('MEDIAN([price])', ctx)).toBe(15);
  });
});
