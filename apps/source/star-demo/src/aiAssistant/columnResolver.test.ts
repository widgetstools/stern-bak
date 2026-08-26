import { describe, expect, it } from 'vitest';
import { resolveColumn, resolveColumns, resolveColumnKeys, type CatalogColumn } from './columnResolver';

const CATALOGUE: CatalogColumn[] = [
  { colId: 'isin', headerName: 'ISIN' },
  { colId: 'marketValue', headerName: 'Market Value' },
  { colId: 'ticker', headerName: 'Ticker' },
  { colId: 'issuerName', headerName: 'Issuer' },
  { colId: 'issuerSector', headerName: 'Sector' },
  { colId: 'dailyPnL', headerName: 'Daily P&L' },
];

function id(input: string): string {
  const res = resolveColumn(input, CATALOGUE);
  if (!res.ok) throw new Error(res.error);
  return res.colId;
}
function fail(input: string, catalogue = CATALOGUE): string {
  const res = resolveColumn(input, catalogue);
  if (res.ok) throw new Error(`expected a rejection, resolved to ${res.colId}`);
  return res.error;
}

describe('what people actually type', () => {
  it('takes the exact colId', () => {
    expect(id('marketValue')).toBe('marketValue');
  });

  it('takes the header as shown', () => {
    expect(id('Market Value')).toBe('marketValue');
  });

  it('ignores case and separators', () => {
    expect(id('market value')).toBe('marketValue');
    expect(id('MARKETVALUE')).toBe('marketValue');
    expect(id('market_value')).toBe('marketValue');
    expect(id('ISIN')).toBe('isin');
    expect(id('isin')).toBe('isin');
  });

  it('handles punctuation in a header', () => {
    expect(id('Daily P&L')).toBe('dailyPnL');
    expect(id('daily pnl')).toBe('dailyPnL');
  });
});

describe('when it should not guess', () => {
  /** Acting on the wrong column is worse than one clarifying question. */
  it('refuses an ambiguous name and names the candidates', () => {
    const ambiguous: CatalogColumn[] = [
      { colId: 'px', headerName: 'Price' },
      { colId: 'vendorPx', headerName: 'price' },
    ];
    const error = fail('PRICE', ambiguous);
    expect(error).toContain('several columns');
    expect(error).toContain('px');
    expect(error).toContain('vendorPx');
  });

  /** An exact colId hit is never ambiguous, even when a header collides. */
  it('lets an exact colId win over a colliding header', () => {
    const colliding: CatalogColumn[] = [
      { colId: 'sector', headerName: 'Industry' },
      { colId: 'industry', headerName: 'sector' },
    ];
    const res = resolveColumn('sector', colliding);
    expect(res.ok === true && res.colId).toBe('sector');
  });

  it('offers near misses rather than the whole grid', () => {
    const error = fail('issu');
    expect(error).toContain('Did you mean');
    expect(error).toContain('issuerName');
    expect(error).toContain('issuerSector');
    expect(error).not.toContain('marketValue');
  });

  /** A header label the user reads off the screen is an exact hit, not a near
   *  miss — "Issuer" is what `issuerName` is called. */
  it('takes a header label that looks like a prefix of two colIds', () => {
    expect(id('issuer')).toBe('issuerName');
  });

  it('lists the grid when nothing is even close', () => {
    const error = fail('zzz');
    expect(error).toContain('This grid has');
  });

  it('rejects an empty name', () => {
    expect(fail('  ')).toContain('non-empty');
  });
});

/** No provider bound means no catalogue to check against; blocking there would
 *  be worse than proceeding, matching how the other column tools behave. */
it('passes input through untouched when the grid has no columns to read', () => {
  const res = resolveColumn('whatever', []);
  expect(res).toEqual({ ok: true, colId: 'whatever' });
});

describe('lists and records', () => {
  it('resolves a list and de-duplicates what collapses to one column', () => {
    const res = resolveColumns(['Market Value', 'marketValue', 'ISIN'], CATALOGUE);
    expect(res.ok === true && res.colIds).toEqual(['marketValue', 'isin']);
  });

  /** One retry should fix every mistake, not just the first. */
  it('reports every failure in a list at once', () => {
    const res = resolveColumns(['nope', 'Market Value', 'alsonope'], CATALOGUE);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('nope');
    expect(res.ok === false && res.error).toContain('alsonope');
  });

  it('rewrites record keys, keeping the values', () => {
    const res = resolveColumnKeys({ 'Market Value': 140, ISIN: 90 }, CATALOGUE);
    expect(res.ok === true && res.value).toEqual({ marketValue: 140, isin: 90 });
  });

  it('rejects a record with an unknown key', () => {
    expect(resolveColumnKeys({ nope: 1 }, CATALOGUE).ok).toBe(false);
  });
});
