import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from './index';
import { simpleAggFuncForColumn, simpleColumnAggregate } from './simpleColumnAggregate';

const engine = new ExpressionEngine();

describe('simpleColumnAggregate', () => {
  it('maps SUM/AVG/MIN/MAX/COUNT of a single column ref', () => {
    expect(simpleColumnAggregate(engine.parse('SUM([price])'))).toEqual({
      fn: 'sum',
      columnId: 'price',
    });
    expect(simpleColumnAggregate(engine.parse('AVG([value])'))?.fn).toBe('avg');
    expect(simpleColumnAggregate(engine.parse('MIN([a])'))?.fn).toBe('min');
    expect(simpleColumnAggregate(engine.parse('MAX([a])'))?.fn).toBe('max');
    expect(simpleColumnAggregate(engine.parse('COUNT([a])'))?.fn).toBe('count');
  });

  it('rejects richer expressions and unknown calls', () => {
    expect(simpleColumnAggregate(engine.parse('SUM([value]) * 1.1'))).toBeUndefined();
    expect(simpleColumnAggregate(engine.parse('MEDIAN([value])'))).toBeUndefined();
    expect(simpleColumnAggregate(null)).toBeUndefined();
    expect(simpleColumnAggregate({})).toBeUndefined();
  });
});

describe('simpleAggFuncForColumn', () => {
  it('accepts [value] or a matching column id', () => {
    const sumValue = engine.parse('SUM([value])');
    expect(simpleAggFuncForColumn(sumValue, 'qty')).toBe('sum');
    expect(simpleAggFuncForColumn(engine.parse('SUM([qty])'), 'qty')).toBe('sum');
    expect(simpleAggFuncForColumn(engine.parse('SUM([other])'), 'qty')).toBeUndefined();
  });
});
