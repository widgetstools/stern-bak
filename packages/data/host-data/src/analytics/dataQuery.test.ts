import { describe, expect, it } from 'vitest';
import { runQuery, validateQuery, type DataQuery } from './dataQuery.js';

const ROWS = [
  { ticker: 'AAPL', sector: 'Tech', desk: 'Credit', marketValue: 100, coupon: 3.5, maturityDate: '2030-01-01' },
  { ticker: 'MSFT', sector: 'Tech', desk: 'Credit', marketValue: 200, coupon: 4.0, maturityDate: '2031-06-30' },
  { ticker: 'JPM', sector: 'Financials', desk: 'Rates', marketValue: 300, coupon: 2.5, maturityDate: '2028-03-15' },
  { ticker: 'GS', sector: 'Financials', desk: 'Rates', marketValue: 400, coupon: 5.5, maturityDate: '2029-12-01' },
  { ticker: 'XOM', sector: 'Energy', desk: 'Credit', marketValue: 500, coupon: 6.0, maturityDate: '2032-09-09' },
];

function run(query: DataQuery) {
  const res = runQuery(ROWS, query);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}
function reject(query: DataQuery): string {
  const res = runQuery(ROWS, query);
  if (res.ok) throw new Error('expected a rejection');
  return res.error;
}

describe('filtering', () => {
  it('ANDs its clauses', () => {
    const out = run({ filter: [{ column: 'sector', op: 'eq', value: 'Tech' }, { column: 'marketValue', op: 'gt', value: 150 }] });
    expect(out.rows.map((r) => r.ticker)).toEqual(['MSFT']);
    expect(out.matched).toBe(1);
    expect(out.scanned).toBe(5);
  });

  it('compares numbers numerically, not as strings', () => {
    // String comparison would put 100 above 90.
    const out = run({ filter: [{ column: 'marketValue', op: 'gte', value: 300 }] });
    expect(out.matched).toBe(3);
  });

  it('supports between, in, contains and startsWith', () => {
    expect(run({ filter: [{ column: 'coupon', op: 'between', value: [3, 5] }] }).matched).toBe(2);
    expect(run({ filter: [{ column: 'desk', op: 'in', value: ['Rates'] }] }).matched).toBe(2);
    expect(run({ filter: [{ column: 'sector', op: 'contains', value: 'financ' }] }).matched).toBe(2);
    expect(run({ filter: [{ column: 'ticker', op: 'startsWith', value: 'a' }] }).matched).toBe(1);
  });

  it('filters ISO dates by string order, which is chronological', () => {
    expect(run({ filter: [{ column: 'maturityDate', op: 'lt', value: '2030-01-01' }] }).matched).toBe(2);
  });

  it('handles empties', () => {
    const rows = [{ a: 1, note: 'x' }, { a: 2, note: null }, { a: 3, note: '' }];
    expect(runQuery(rows as never, { filter: [{ column: 'note', op: 'isEmpty' }] })).toMatchObject({ value: { matched: 2 } });
    expect(runQuery(rows as never, { filter: [{ column: 'note', op: 'notEmpty' }] })).toMatchObject({ value: { matched: 1 } });
  });
});

describe('grouping and aggregation', () => {
  it('groups with an explicit aggregate', () => {
    const out = run({ groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] });
    expect(out.columns).toEqual(['sector', 'sum_marketValue']);
    const financials = out.rows.find((r) => r.sector === 'Financials');
    expect(financials?.sum_marketValue).toBe(700);
  });

  it('defaults to a row count when no aggregate is given', () => {
    const out = run({ groupBy: ['desk'] });
    expect(out.columns).toEqual(['desk', 'count']);
    expect(out.rows.find((r) => r.desk === 'Credit')?.count).toBe(3);
  });

  it('honours an aggregate alias', () => {
    const out = run({ groupBy: ['desk'], aggregate: [{ column: 'ticker', fn: 'countDistinct', as: 'names' }] });
    expect(out.columns).toContain('names');
    expect(out.rows.find((r) => r.desk === 'Rates')?.names).toBe(2);
  });

  it('computes avg, min and max', () => {
    const out = run({ groupBy: ['sector'], aggregate: [
      { column: 'coupon', fn: 'avg' }, { column: 'coupon', fn: 'min' }, { column: 'coupon', fn: 'max' },
    ] });
    const tech = out.rows.find((r) => r.sector === 'Tech');
    expect(tech).toMatchObject({ avg_coupon: 3.75, min_coupon: 3.5, max_coupon: 4 });
  });

  it('groups on two levels', () => {
    const out = run({ groupBy: ['desk', 'sector'] });
    expect(out.columns).toEqual(['desk', 'sector', 'count']);
    expect(out.rows.length).toBe(3);
    expect(out.rows.find((r) => r.desk === 'Credit' && r.sector === 'Tech')?.count).toBe(2);
  });

  /** A grid-wide total has a better home, and silently ignoring the aggregate
   *  would hand back a plain row list that looks like it worked. */
  it('refuses an aggregate with no groupBy, pointing at the right tool', () => {
    expect(reject({ aggregate: [{ column: 'marketValue', fn: 'sum' }] })).toContain('summarize_grid_data');
  });
});

describe('pivot', () => {
  it('cross-tabs rows by pivotBy, filling cells with the aggregate and leaving unmatched combinations null', () => {
    const out = run({ groupBy: ['desk'], pivotBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] });

    // A single aggregate keeps the pivot value alone as the column header.
    expect(out.columns).toEqual(['desk', 'Energy', 'Financials', 'Tech']);
    expect(out.pivot).toEqual({ rowDims: ['desk'], colDims: ['sector'], measures: ['sum_marketValue'] });
    expect(out.grouped).toBe(true);

    const credit = out.rows.find((r) => r.desk === 'Credit');
    // Credit desk holds Tech (100+200) and Energy (500), no Financials.
    expect(credit).toMatchObject({ Tech: 300, Energy: 500, Financials: null });

    const rates = out.rows.find((r) => r.desk === 'Rates');
    // Rates desk holds only Financials (300+400) — the other two cells are gaps, not zeros.
    expect(rates).toMatchObject({ Financials: 700, Tech: null, Energy: null });
  });

  it('prefixes the aggregate name in the column header once there is more than one', () => {
    const out = run({
      groupBy: ['desk'], pivotBy: ['sector'],
      aggregate: [{ column: 'marketValue', fn: 'sum' }, { column: 'ticker', fn: 'count' }],
    });
    expect(out.columns).toContain('sum_marketValue · Tech');
    expect(out.columns).toContain('count_ticker · Tech');
  });

  it('requires groupBy — pivotBy alone has no row dimension to roll up into', () => {
    expect(reject({ pivotBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] })).toContain('pivotBy needs groupBy');
  });

  it('requires an aggregate — nothing to fill the pivoted cells with otherwise', () => {
    expect(reject({ groupBy: ['desk'], pivotBy: ['sector'] })).toContain('pivotBy needs aggregate');
  });

  it('refuses a column used as both the row and column dimension', () => {
    const err = reject({ groupBy: ['sector'], pivotBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] });
    expect(err).toContain('sector');
    expect(err).toContain('not both');
  });

  /** A wide-open pivot column (e.g. cusip) would otherwise silently build a
   *  table nobody can read instead of failing with something actionable.
   *  `reject()` runs against the module-level ROWS fixture, which is too
   *  narrow to trip this — build data for the case instead. */
  it('caps the number of distinct pivot columns rather than building an unusable table', () => {
    const wide = Array.from({ length: 35 }, (_, i) => ({ g: 'x', grp: `v${i}`, val: i }));
    const res = runQuery(wide, { groupBy: ['g'], pivotBy: ['grp'], aggregate: [{ column: 'val', fn: 'sum' }] });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('35');
    expect(res.ok === false && res.error).toContain('30');
  });

  /** Two distinct pivot tuples whose flattened labels collide must be caught,
   *  not silently overwrite each other's numbers. */
  it('rejects a flattened pivot-column name collision', () => {
    const rows = [{ g: 'x', grp: 'Y · Z', v: 1 }, { g: 'x', grp: 'Z', v: 2 }];
    const res = runQuery(rows, {
      groupBy: ['g'], pivotBy: ['grp'],
      aggregate: [{ column: 'v', fn: 'sum', as: 'X' }, { column: 'v', fn: 'sum', as: 'X · Y' }],
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('duplicate column name');
  });

  it('sorts a pivoted table by a generated column', () => {
    const out = run({
      groupBy: ['desk'], pivotBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }],
      sortBy: { column: 'Financials', direction: 'desc' },
    });
    expect(out.rows[0].desk).toBe('Rates');
  });

  it('limits and reports truncation on a pivoted table same as a flat one', () => {
    const out = run({ groupBy: ['desk'], pivotBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }], limit: 1 });
    expect(out.matched).toBe(2);
    expect(out.rows.length).toBe(1);
    expect(out.truncated).toBe(true);
  });
});

/**
 * The query-engine counterpart of `dataDigest.ts`'s `buildHighlights` — a
 * chart/pivot/heatmap result carries the same kind of computed synopsis a
 * summarize_grid_data digest does, rather than depending entirely on the
 * model to write one every turn.
 */
describe('highlights', () => {
  it('names the leading group and its share for a grouped result', () => {
    const out = run({ groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] });
    // Tech 300, Financials 700, Energy 500 — total 1500, Financials leads at 46.67%.
    expect(out.highlights).toEqual([
      'Financials leads on sum_marketValue at 700 (46.67% of the 1,500 total across 3 sector group(s)).',
    ]);
  });

  it('names the largest cell for a pivoted result', () => {
    const out = run({ groupBy: ['desk'], pivotBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }] });
    // Cells: Credit×Tech 300, Credit×Energy 500, Rates×Financials 700 — total 1500.
    expect(out.highlights).toEqual(['Largest cell: Rates × Financials at 700 (46.67% of the 1,500 total).']);
  });

  it('says nothing once the result is truncated — a share-of-total claim would be dishonest', () => {
    const out = run({ groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }], limit: 1 });
    expect(out.truncated).toBe(true);
    expect(out.highlights).toEqual([]);
  });

  it('says nothing for a single group — nothing to compare it against', () => {
    const out = run({ groupBy: ['sector'], filter: [{ column: 'sector', op: 'eq', value: 'Tech' }] });
    expect(out.rows.length).toBe(1);
    expect(out.highlights).toEqual([]);
  });

  it('says nothing for a raw, ungrouped query — no group or cell to call a leader', () => {
    const out = run({ filter: [{ column: 'marketValue', op: 'gt', value: 0 }] });
    expect(out.grouped).toBe(false);
    expect(out.highlights).toEqual([]);
  });
});

describe('sorting and limits', () => {
  it('defaults to descending, which is what "top N" means', () => {
    const out = run({ columns: ['ticker', 'marketValue'], sortBy: { column: 'marketValue' }, limit: 2 });
    expect(out.rows.map((r) => r.ticker)).toEqual(['XOM', 'GS']);
  });

  it('sorts ascending on request', () => {
    const out = run({ columns: ['ticker'], sortBy: { column: 'marketValue', direction: 'asc' }, limit: 1 });
    expect(out.rows[0].ticker).toBe('AAPL');
  });

  /** Sorting by a column that isn't projected would otherwise sort a field of
   *  undefineds and look broken. */
  it('adds the sort column to the projection when it was left out', () => {
    const out = run({ columns: ['ticker'], sortBy: { column: 'marketValue' } });
    expect(out.columns).toEqual(['ticker', 'marketValue']);
    expect(out.rows[0]).toMatchObject({ ticker: 'XOM', marketValue: 500 });
  });

  it('reports truncation honestly', () => {
    const out = run({ limit: 2 });
    expect(out).toMatchObject({ matched: 5, truncated: true });
    expect(out.rows.length).toBe(2);
  });

  it('caps the limit', () => {
    const many = Array.from({ length: 900 }, (_, i) => ({ i }));
    const res = runQuery(many, { limit: 10_000 });
    expect(res.ok === true && res.value.rows.length).toBe(500);
  });

  it('sorts grouped results too', () => {
    const out = run({ groupBy: ['sector'], aggregate: [{ column: 'marketValue', fn: 'sum' }], sortBy: { column: 'sum_marketValue' } });
    expect(out.rows[0]).toMatchObject({ sector: 'Financials', sum_marketValue: 700 });
  });
});

describe('validation', () => {
  it('names the valid ops', () => {
    expect(reject({ filter: [{ column: 'x', op: 'like' as never, value: 1 }] })).toContain('contains');
  });

  it('catches a missing operand', () => {
    expect(reject({ filter: [{ column: 'sector', op: 'eq' }] })).toContain('needs a value');
  });

  it('catches a malformed between and in', () => {
    expect(reject({ filter: [{ column: 'coupon', op: 'between', value: 3 }] })).toContain('two-element');
    expect(reject({ filter: [{ column: 'desk', op: 'in', value: 'Rates' }] })).toContain('array');
  });

  it('names the valid aggregate functions', () => {
    expect(reject({ groupBy: ['desk'], aggregate: [{ column: 'v', fn: 'median' as never }] })).toContain('countDistinct');
  });

  it('rejects a nonsensical limit', () => {
    expect(reject({ limit: 0 })).toContain('positive');
  });

  it('passes a well-formed query', () => {
    expect(validateQuery({ groupBy: ['desk'], aggregate: [{ column: 'marketValue', fn: 'sum' }] })).toBeNull();
  });
});

describe('projection', () => {
  it('infers a capped column list when none is given', () => {
    const out = run({ limit: 1 });
    expect(out.columns.length).toBeGreaterThan(0);
    expect(out.columns.length).toBeLessThanOrEqual(8);
  });

  it('returns exactly the projected columns', () => {
    const out = run({ columns: ['ticker', 'sector'], limit: 1 });
    expect(Object.keys(out.rows[0])).toEqual(['ticker', 'sector']);
  });
});
