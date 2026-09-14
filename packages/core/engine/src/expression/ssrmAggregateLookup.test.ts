import { describe, expect, it } from 'vitest';
import { SSRM_EXPR_AGG_KEY, lookupSsrmExprAggregate } from './ssrmAggregateLookup';

describe('lookupSsrmExprAggregate', () => {
  it('returns undefined without an api or session', () => {
    expect(lookupSsrmExprAggregate(null)).toBeUndefined();
    expect(lookupSsrmExprAggregate({})).toBeUndefined();
    expect(lookupSsrmExprAggregate({ [SSRM_EXPR_AGG_KEY]: {} })).toBeUndefined();
  });

  it('delegates to the attached session', () => {
    const api = {
      [SSRM_EXPR_AGG_KEY]: {
        resolve: (fn: string, columnId: string) => `${fn}:${columnId}`,
      },
    };
    expect(lookupSsrmExprAggregate(api)?.('SUM', 'price')).toBe('SUM:price');
  });
});
