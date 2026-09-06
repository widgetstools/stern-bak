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

let books: Record<string, { rows?: Array<Record<string, unknown>>; error?: string }> = {};
vi.mock('./dataAccess', () => ({
  fetchGridRows: async (_cm: unknown, _cs: unknown, e: { configId: string }) => {
    const b = books[e.configId];
    if (!b || b.error) return { ok: false, error: b?.error ?? 'no data provider bound' };
    return { ok: true, value: { rows: b.rows ?? [], source: 'live', providerId: 'p', providerName: 'F', provenance: 'live' } };
  },
}));

const CATALOGUE = [
  { colId: 'cusip', headerName: 'Cusip' },
  { colId: 'marketValue', headerName: 'Market Value', cellDataType: 'number' },
];
vi.mock('./columnResolver', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readColumnCatalogue: async () => CATALOGUE,
}));

import { morningBrief } from './briefTools';
import { captureBaseline } from './baselineTools';
import { addLimit } from './deskTools';

function fakeManager() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    getConfig: vi.fn(async (id: string) => rows.get(id)),
    saveConfig: vi.fn(async (r: { configId: string }) => { rows.set(r.configId, r); }),
    findByComponentType: vi.fn(async (type: string, sub: string) =>
      [...rows.values()].filter(
        (r) => (r as { componentType: string }).componentType === type
          && (r as { componentSubType: string }).componentSubType === sub,
      ),
    ),
    profiles: {
      loadGridLevelData: vi.fn(async () => ({ provider: { liveProviderId: 'p1' } })),
      list: vi.fn(async () => []), save: vi.fn(), saveGridLevelData: vi.fn(),
    },
  } as unknown as ConfigManager;
}
const store = { get: vi.fn(async () => ({ name: 'F', config: { keyColumn: 'cusip' } })) } as unknown as DataProviderConfigStore;
const deps = (cm: ConfigManager) => ({ configManager: cm, configStore: store });

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [CREDIT, RATES] });
  books = {};
});

describe('morning_brief', () => {
  it('covers every blotter with its row count', async () => {
    books = {
      'grid-credit': { rows: [{ cusip: 'A', marketValue: 10 }] },
      'grid-rates': { rows: [{ cusip: 'B', marketValue: 20 }, { cusip: 'C', marketValue: 5 }] },
    };
    const res = await morningBrief(deps(fakeManager()), {});
    expect(res.ok).toBe(true);
    expect(res.summary).toContain('Credit: 1 rows');
    expect(res.summary).toContain('Rates: 2 rows');
  });

  /**
   * A brief that quietly skips the book it could not read still sounds
   * complete, which is the failure that matters most here.
   */
  it('names a blotter it could not read instead of omitting it', async () => {
    books = {
      'grid-credit': { rows: [{ cusip: 'A', marketValue: 10 }] },
      'grid-rates': { error: 'no data provider bound' },
    };
    const res = await morningBrief(deps(fakeManager()), {});
    expect(res.summary).toContain('NOT covered by this brief: Rates');
    expect((res.data as { unreadable: string[] }).unreadable).toHaveLength(1);
  });

  it('fails outright when nothing could be read', async () => {
    books = { 'grid-credit': { error: 'x' }, 'grid-rates': { error: 'y' } };
    const res = await morningBrief(deps(fakeManager()), {});
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/nothing to brief on/);
  });

  /** No baseline is a normal state, not a failure — and not "nothing moved". */
  it('offers to mark a baseline rather than implying nothing moved', async () => {
    books = { 'grid-credit': { rows: [{ cusip: 'A', marketValue: 10 }] }, 'grid-rates': { rows: [] } };
    const res = await morningBrief(deps(fakeManager()), {});
    expect(res.summary).toContain('No baseline captured');
    expect(res.summary).not.toContain('Nothing moved');
  });

  it('reports movers against a baseline that exists', async () => {
    const cm = fakeManager();
    books = { 'grid-credit': { rows: [{ cusip: 'A', marketValue: 100 }] }, 'grid-rates': { rows: [] } };
    await captureBaseline(deps(cm), { targetGridId: 'grid-credit', name: 'open' });
    books['grid-credit'] = { rows: [{ cusip: 'A', marketValue: 150 }] };
    const res = await morningBrief(deps(cm), {});
    expect(res.summary).toContain('Since "open"');
    expect(res.summary).toContain('1 row(s) changed');
  });

  it('carries the limit check through, breaches and all', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Book cap', metric: 'marketValue', max: 5 });
    books = { 'grid-credit': { rows: [{ cusip: 'A', marketValue: 100 }] }, 'grid-rates': { rows: [] } };
    const res = await morningBrief(deps(cm), {});
    expect(res.summary).toContain('Limits:');
    expect(res.summary).toContain('breach');
  });

  it('says so when no limits are set', async () => {
    books = { 'grid-credit': { rows: [{ cusip: 'A', marketValue: 1 }] }, 'grid-rates': { rows: [] } };
    const res = await morningBrief(deps(fakeManager()), {});
    expect(res.summary).toContain('No limits are set');
  });

  it('restricts to the blotters it was given', async () => {
    books = { 'grid-credit': { rows: [{ cusip: 'A', marketValue: 1 }] }, 'grid-rates': { rows: [] } };
    const res = await morningBrief(deps(fakeManager()), { gridIds: ['grid-credit'] });
    expect((res.data as { books: unknown[] }).books).toHaveLength(1);
    expect(res.summary).not.toContain('Rates:');
  });
});
