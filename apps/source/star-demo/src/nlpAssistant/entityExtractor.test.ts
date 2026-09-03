import { describe, it, expect } from 'vitest';
import { extractEntities, resolveColumn, type CatalogueColumn } from './entityExtractor';

const CAT: CatalogueColumn[] = [
  { colId: 'issuerSector', headerName: 'Sector', numeric: false },
  { colId: 'notional', headerName: 'Notional', numeric: true },
  { colId: 'marketValue', headerName: 'Market Value', numeric: true },
  { colId: 'ytm', headerName: 'YTM', numeric: true },
  { colId: 'cusip', headerName: 'CUSIP', numeric: false },
  { colId: 'desk', headerName: 'Desk', numeric: false },
];

describe('resolveColumn', () => {
  it('matches colId, header, loose forms', () => {
    expect(resolveColumn('marketValue', CAT)).toBe('marketValue');
    expect(resolveColumn('Market Value', CAT)).toBe('marketValue');
    expect(resolveColumn('market value', CAT)).toBe('marketValue');
    expect(resolveColumn('sector', CAT)).toBe('issuerSector');
    expect(resolveColumn('ytm', CAT)).toBe('ytm');
  });
  it('rejects things that match nothing', () => {
    expect(resolveColumn('banana', CAT)).toBeUndefined();
  });
});

describe('extractEntities', () => {
  it('finds columns, preferring the longest phrase', () => {
    const e = extractEntities('group by sector and show market value', CAT);
    expect(e.columns).toEqual(['issuerSector', 'marketValue']);
  });

  it('extracts aggregations with their function', () => {
    const e = extractEntities('group by desk and sum notional, average ytm', CAT);
    expect(e.aggregations).toEqual({ notional: 'sum', ytm: 'avg' });
    expect(e.columns).toContain('desk');
  });

  it('extracts sort direction and limit', () => {
    const e = extractEntities('top 10 by market value desc', CAT);
    expect(e.sortDirection).toBe('desc');
    expect(e.limit).toBe(10);
    expect(e.columns).toEqual(['marketValue']);
  });

  it('extracts filter clauses with operators and magnitudes', () => {
    const e = extractEntities('show rows where notional over 1.5m and sector is Financials', CAT);
    expect(e.filters).toEqual([
      { column: 'notional', op: 'gt', value: 1_500_000 },
      { column: 'issuerSector', op: 'eq', value: 'Financials' },
    ]);
  });

  it('reports unresolved filter columns', () => {
    const e = extractEntities('where banana is 3', CAT);
    expect(e.unresolved).toEqual(['banana']);
    expect(e.filters).toEqual([]);
  });

  it('detects chart kinds', () => {
    expect(extractEntities('pie chart of notional by sector', CAT).chartKind).toBe('pie');
    expect(extractEntities('visualise notional by desk', CAT).chartKind).toBe('auto');
  });
});
