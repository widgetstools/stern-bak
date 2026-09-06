import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';

function entry(configId: string, displayName: string, sub: string) {
  return {
    id: configId, configId, componentType: 'grid', componentSubType: sub, displayName,
    hostUrl: '', iconId: '', createdAt: '', type: 'internal' as const, usesHostConfig: true,
    appId: 'Star-Demo', configServiceUrl: '', singleton: true, asWindow: true,
  };
}
const CREDIT = entry('grid-credit', 'Credit', 'credit');
const RATES = entry('grid-rates', 'Rates', 'rates');

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
}));

/** Per-blotter rows and catalogues, keyed by configId. */
let books: Record<string, { rows?: Array<Record<string, unknown>>; error?: string; catalogue?: Array<{ colId: string; headerName?: string; cellDataType?: string }> }> = {};

vi.mock('./dataAccess', () => ({
  fetchGridRows: async (_cm: unknown, _cs: unknown, e: { configId: string }) => {
    const book = books[e.configId];
    if (!book || book.error) return { ok: false, error: book?.error ?? 'no provider' };
    return {
      ok: true,
      value: { rows: book.rows ?? [], source: 'live', providerId: 'p', providerName: 'F', provenance: 'live' },
    };
  },
}));
vi.mock('./columnResolver', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readColumnCatalogue: async (_cm: unknown, _cs: unknown, e: { configId: string }) =>
    books[e.configId]?.catalogue ?? [],
}));

import { queryAcrossBlotters } from './portfolioTools';

const deps = {
  configManager: {} as ConfigManager,
  configStore: {} as DataProviderConfigStore,
};

const MV = [
  { colId: 'marketValue', headerName: 'Market Value', cellDataType: 'number' },
  { colId: 'sector', headerName: 'Sector' },
];

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [CREDIT, RATES] });
  books = {};
});

function table(res: { data?: unknown }) {
  return (res.data as { table: { rows: Array<Record<string, unknown>>; scanned: number } }).table;
}

describe('query_across_blotters', () => {
  it('unions every blotter and totals across them', async () => {
    books = {
      'grid-credit': { rows: [{ marketValue: 100 }, { marketValue: 50 }], catalogue: MV },
      'grid-rates': { rows: [{ marketValue: 25 }], catalogue: MV },
    };
    const res = await queryAcrossBlotters(deps, {
      groupBy: ['blotter'], aggregate: [{ column: 'marketValue', fn: 'sum', as: 'total' }],
    });
    expect(res.ok).toBe(true);
    const byBook = Object.fromEntries(table(res).rows.map((r) => [r.blotter, r.total]));
    expect(byBook).toEqual({ Credit: 150, Rates: 25 });
    expect(table(res).scanned).toBe(3);
  });

  /** The whole point: a row knows which book it came from. */
  it('tags each row with its blotter so a total can be broken down', async () => {
    books = {
      'grid-credit': { rows: [{ marketValue: 1 }], catalogue: MV },
      'grid-rates': { rows: [{ marketValue: 2 }], catalogue: MV },
    };
    const res = await queryAcrossBlotters(deps, { columns: ['blotter', 'marketValue'] });
    expect(table(res).rows.map((r) => r.blotter).sort()).toEqual(['Credit', 'Rates']);
  });

  it('resolves a column name the way the user said it', async () => {
    books = {
      'grid-credit': { rows: [{ marketValue: 10 }], catalogue: MV },
      'grid-rates': { rows: [{ marketValue: 5 }], catalogue: MV },
    };
    const res = await queryAcrossBlotters(deps, {
      groupBy: ['blotter'], aggregate: [{ column: 'Market Value', fn: 'sum', as: 't' }],
    });
    expect(res.ok).toBe(true);
    expect(table(res).rows.map((r) => r.t).sort()).toEqual([10, 5]);
  });

  it('restricts to the blotters it was given', async () => {
    books = {
      'grid-credit': { rows: [{ marketValue: 100 }], catalogue: MV },
      'grid-rates': { rows: [{ marketValue: 25 }], catalogue: MV },
    };
    const res = await queryAcrossBlotters(deps, { gridIds: ['grid-credit'], columns: ['marketValue'] });
    expect(table(res).scanned).toBe(1);
    expect(res.summary).toContain('1 blotter(s)');
  });

  /**
   * A total that quietly omits a whole book still looks like a total. The
   * exclusion has to be in the summary the model reads, not only in the data.
   */
  it('names blotters it could not read and says the total excludes them', async () => {
    books = {
      'grid-credit': { rows: [{ marketValue: 100 }], catalogue: MV },
      'grid-rates': { error: 'no data provider bound' },
    };
    const res = await queryAcrossBlotters(deps, { columns: ['marketValue'] });
    expect(res.ok).toBe(true);
    expect(res.summary).toContain('NOT included: Rates');
    expect(res.summary).toContain('does not cover them');
    expect((res.data as { provenance: string }).provenance).toContain('SKIPPED');
  });

  /**
   * Two books calling different columns the same thing is the trap: summing
   * them into one number is wrong in a way that looks right.
   */
  it('refuses when a name means different columns on different blotters', async () => {
    books = {
      'grid-credit': { rows: [{ marketValue: 1 }], catalogue: MV },
      'grid-rates': {
        rows: [{ mv: 2 }],
        catalogue: [{ colId: 'mv', headerName: 'Market Value', cellDataType: 'number' }],
      },
    };
    const res = await queryAcrossBlotters(deps, {
      groupBy: ['blotter'], aggregate: [{ column: 'Market Value', fn: 'sum', as: 't' }],
    });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/means different columns/);
    expect(res.summary).toContain('marketValue');
    expect(res.summary).toContain('mv');
  });

  it('refuses a column no blotter has', async () => {
    books = { 'grid-credit': { rows: [{ marketValue: 1 }], catalogue: MV } };
    const res = await queryAcrossBlotters(deps, { columns: ['nope'] });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/No column matching "nope"/);
  });

  it('refuses an unregistered blotter id rather than silently skipping it', async () => {
    books = { 'grid-credit': { rows: [], catalogue: MV } };
    const res = await queryAcrossBlotters(deps, { gridIds: ['grid-nope'] });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/No grid registered with id "grid-nope"/);
  });

  it('fails clearly when nothing could be read at all', async () => {
    books = { 'grid-credit': { error: 'no provider' }, 'grid-rates': { error: 'no provider' } };
    const res = await queryAcrossBlotters(deps, { columns: ['marketValue'] });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/None of the blotters could be read/);
  });

  it('says so when no blotters are registered', async () => {
    mockLoadRegistryConfig.mockResolvedValue({ version: 2, entries: [] });
    const res = await queryAcrossBlotters(deps, { columns: ['x'] });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/No blotters are registered/);
  });

  it('filters across the union', async () => {
    books = {
      'grid-credit': { rows: [{ marketValue: 100, sector: 'Tech' }, { marketValue: 5, sector: 'Energy' }], catalogue: MV },
      'grid-rates': { rows: [{ marketValue: 50, sector: 'Tech' }], catalogue: MV },
    };
    const res = await queryAcrossBlotters(deps, {
      filter: [{ column: 'sector', op: 'eq', value: 'Tech' }],
      groupBy: ['blotter'],
      aggregate: [{ column: 'marketValue', fn: 'sum', as: 't' }],
    });
    const byBook = Object.fromEntries(table(res).rows.map((r) => [r.blotter, r.t]));
    expect(byBook).toEqual({ Credit: 100, Rates: 50 });
  });
});
