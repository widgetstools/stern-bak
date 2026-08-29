import { describe, expect, it } from 'vitest';
import { summariseRows, type NumericStats, type CategoryStats, type DateStats } from './dataDigest.js';

const ROWS = [
  { ticker: 'AAPL', sector: 'Tech', marketValue: 100, maturityDate: '2030-01-01', active: true },
  { ticker: 'MSFT', sector: 'Tech', marketValue: 200, maturityDate: '2031-06-30', active: true },
  { ticker: 'JPM', sector: 'Financials', marketValue: 300, maturityDate: '2028-03-15', active: false },
  { ticker: 'GS', sector: 'Financials', marketValue: 400, maturityDate: '2029-12-01', active: true },
  { ticker: 'XOM', sector: 'Energy', marketValue: 500, maturityDate: '2032-09-09', active: true },
];

function col<T>(rows: typeof ROWS, colId: string): T {
  const digest = summariseRows(rows, { columns: ['ticker', 'sector', 'marketValue', 'maturityDate', 'active'] });
  return digest.columns.find((c) => c.colId === colId) as T;
}

describe('column classification', () => {
  it('reads a numeric column and computes exact statistics', () => {
    const stat = col<NumericStats>(ROWS, 'marketValue');
    expect(stat.kind).toBe('number');
    expect(stat).toMatchObject({ count: 5, nulls: 0, sum: 1500, mean: 300, min: 100, max: 500, median: 300 });
  });

  it('takes the mean of the middle two for an even row count', () => {
    const stat = col<NumericStats>(ROWS.slice(0, 4), 'marketValue');
    expect(stat.median).toBe(250);
  });

  it('reads a categorical column with shares that sum sensibly', () => {
    const stat = col<CategoryStats>(ROWS, 'sector');
    expect(stat.kind).toBe('text');
    expect(stat.distinct).toBe(3);
    expect(stat.top[0]).toMatchObject({ count: 2 });
    expect(stat.top.reduce((a, t) => a + t.share, 0)).toBeCloseTo(100, 0);
  });

  it('reads ISO date strings as dates, not text', () => {
    const stat = col<DateStats>(ROWS, 'maturityDate');
    expect(stat.kind).toBe('date');
    expect(stat.earliest).toBe('2028-03-15');
    expect(stat.latest).toBe('2032-09-09');
  });

  it('reads booleans as a two-value category', () => {
    const stat = col<CategoryStats>(ROWS, 'active');
    expect(stat.kind).toBe('boolean');
    expect(stat.distinct).toBe(2);
  });

  /** A column of mixed types must not be summed as if it were numeric. */
  it('falls back to text when a column mixes types', () => {
    const stat = col<CategoryStats>([...ROWS, { ...ROWS[0], marketValue: 'n/a' } as never], 'marketValue');
    expect(stat.kind).toBe('text');
  });

  it('counts blanks without letting them skew the average', () => {
    const rows = [{ v: 10 }, { v: null }, { v: 30 }, { v: undefined }];
    const digest = summariseRows(rows as never, { columns: ['v'] });
    const stat = digest.columns[0] as NumericStats;
    expect(stat).toMatchObject({ count: 2, nulls: 2, sum: 40, mean: 20 });
  });
});

describe('highlights', () => {
  it('names a concentrated category', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ sector: i < 8 ? 'Financials' : 'Energy', v: 1 }));
    const digest = summariseRows(rows, { columns: ['sector', 'v'] });
    expect(digest.highlights.some((h) => h.includes('sector is concentrated') && h.includes('80%'))).toBe(true);
  });

  it('reports the top-5 concentration against the total, naming the rows', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ ticker: `T${i}`, marketValue: i < 5 ? 100 : 1 }));
    const digest = summariseRows(rows, { columns: ['ticker', 'marketValue'] });
    const line = digest.highlights.find((h) => h.startsWith('Top 5'));
    // 500 of 515 total.
    expect(line).toContain('97.09%');
    expect(line).toContain('T0');
  });

  it('flags a sparse column', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ note: i < 2 ? 'x' : null, v: i }));
    const digest = summariseRows(rows as never, { columns: ['note', 'v'] });
    expect(digest.highlights.some((h) => h.includes('Sparse') && h.includes('80%'))).toBe(true);
  });

  it('says so plainly when there are no rows', () => {
    const digest = summariseRows([]);
    expect(digest).toMatchObject({ rowCount: 0, columns: [], sample: [] });
    expect(digest.highlights[0]).toContain('no rows');
  });
});

describe('grouping', () => {
  it('buckets by a column with counts, shares and totals', () => {
    const digest = summariseRows(ROWS, { columns: ['sector', 'marketValue'], groupBy: 'sector' });
    expect(digest.groups?.by).toBe('sector');
    const financials = digest.groups?.buckets.find((b) => b.value === 'Financials');
    expect(financials).toMatchObject({ rowCount: 2, share: 40 });
    expect(financials?.totals.marketValue).toBe(700);
  });

  it('labels missing group keys rather than dropping the rows', () => {
    const digest = summariseRows([{ sector: null, v: 1 }, { sector: 'Tech', v: 2 }] as never, {
      columns: ['sector', 'v'], groupBy: 'sector',
    });
    expect(digest.groups?.buckets.map((b) => b.value).sort()).toEqual(['(blank)', 'Tech']);
  });
});

describe('column selection', () => {
  /** A positions row carries 250+ fields; describing them all would swamp the
   *  model's context and the output cell. */
  it('caps the inferred column list', () => {
    const wide = [Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`f${i}`, i]))];
    expect(summariseRows(wide).columns.length).toBe(15);
    expect(summariseRows(wide, { maxColumns: 4 }).columns.length).toBe(4);
  });

  it('honours an explicit column list', () => {
    const digest = summariseRows(ROWS, { columns: ['marketValue'] });
    expect(digest.columns.map((c) => c.colId)).toEqual(['marketValue']);
  });

  it('keeps the sample small and projected to the chosen columns', () => {
    const digest = summariseRows(ROWS, { columns: ['ticker'] });
    expect(digest.sample).toEqual([{ ticker: 'AAPL' }, { ticker: 'MSFT' }, { ticker: 'JPM' }]);
  });
});
