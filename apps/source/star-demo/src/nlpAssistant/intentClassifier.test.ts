import { describe, it, expect } from 'vitest';
import { classifyIntent, shouldUseServerNLP } from './intentClassifier';

describe('classifyIntent', () => {
  it.each([
    ['group by sector', 'group_grid'],
    ['roll up by desk', 'group_grid'],
    ['pivot by currency and sector', 'pivot_grid'],
    ['sort by notional desc', 'sort_data'],
    ['order by yield ascending', 'sort_data'],
    ['hide the cusip column', 'hide_columns'],
    ['show only Financials', 'filter_data'],
    ['filter by rating', 'filter_data'],
    ['what is the total notional', 'query_data'],
    ['show me a bar chart of dv01 by desk', 'create_chart'],
    ['clear grouping', 'clear_grouping'],
    ['flatten the grid', 'clear_grouping'],
  ])('%s → %s', (input, expected) => {
    expect(classifyIntent(input).intent).toBe(expected);
  });

  it('returns unknown with zero confidence for gibberish', () => {
    const r = classifyIntent('lorem ipsum dolor');
    expect(r.intent).toBe('unknown');
    expect(r.confidence).toBe(0);
  });

  it('confidence is in [0,1]', () => {
    const r = classifyIntent('group by sector and sum notional');
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

describe('shouldUseServerNLP', () => {
  it('defers unknown and low-confidence results to the server', () => {
    expect(shouldUseServerNLP(classifyIntent('lorem ipsum'))).toBe(true);
    expect(shouldUseServerNLP({ intent: 'sort_data', confidence: 0.3, keywords: [], parameters: {} })).toBe(true);
  });
  it('keeps confident simple requests local', () => {
    expect(shouldUseServerNLP(classifyIntent('sort by notional desc'))).toBe(false);
  });
});
