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
const BOOK = entry('grid-credit', 'Credit', 'credit');

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
}));

let liveRows: Array<Record<string, unknown>> = [];
vi.mock('./dataAccess', () => ({
  fetchGridRows: async () => ({
    ok: true,
    value: { rows: liveRows, source: 'live', providerId: 'p', providerName: 'F', provenance: 'live' },
  }),
}));

const CATALOGUE = [
  { colId: 'marketValue', headerName: 'Market Value', cellDataType: 'number' },
  { colId: 'issuer', headerName: 'Issuer' },
];
vi.mock('./columnResolver', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readColumnCatalogue: async () => CATALOGUE,
}));

import { setDeskContext, addLimit, checkLimits, listLimits, removeLimit, readDeskContext } from './deskTools';

function fakeManager() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    getConfig: vi.fn(async (id: string) => rows.get(id)),
    saveConfig: vi.fn(async (row: { configId: string }) => { rows.set(row.configId, row); }),
    findByComponentType: vi.fn(async () => []),
    profiles: { loadGridLevelData: vi.fn(async () => ({})), list: vi.fn(async () => []), save: vi.fn(), saveGridLevelData: vi.fn() },
  } as unknown as ConfigManager;
}
const store = {} as DataProviderConfigStore;
const deps = (cm: ConfigManager) => ({ configManager: cm, configStore: store });

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [BOOK] });
  liveRows = [];
});

describe('desk context', () => {
  it('persists mandate and benchmark', async () => {
    const cm = fakeManager();
    await setDeskContext(cm, { mandate: 'US IG credit, duration 4-6', benchmark: 'the Agg' });
    const ctx = await readDeskContext(cm);
    expect(ctx.mandate).toBe('US IG credit, duration 4-6');
    expect(ctx.benchmark).toBe('the Agg');
  });

  it('updates one field without clearing the other', async () => {
    const cm = fakeManager();
    await setDeskContext(cm, { mandate: 'A', benchmark: 'B' });
    await setDeskContext(cm, { benchmark: 'C' });
    const ctx = await readDeskContext(cm);
    expect(ctx.mandate).toBe('A');
    expect(ctx.benchmark).toBe('C');
  });

  it('refuses an empty call', async () => {
    const res = await setDeskContext(fakeManager(), {});
    expect(res.ok).toBe(false);
  });

  it('is empty before anything is set', async () => {
    expect(await readDeskContext(fakeManager())).toEqual({ mandate: undefined, benchmark: undefined, limits: [] });
  });
});

describe('limits', () => {
  it('records a percent-of-total cap and keeps context intact', async () => {
    const cm = fakeManager();
    await setDeskContext(cm, { mandate: 'M' });
    await addLimit(cm, { name: 'Single issuer cap', metric: 'marketValue', groupBy: 'issuer', unit: 'percentOfTotal', max: 5 });
    const ctx = await readDeskContext(cm);
    expect(ctx.mandate).toBe('M');
    expect(ctx.limits).toHaveLength(1);
    expect(ctx.limits[0].id).toBe('single-issuer-cap');
  });

  it('refuses a limit with no bound to breach', async () => {
    const res = await addLimit(fakeManager(), { name: 'x', metric: 'marketValue' });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/needs max and\/or min/);
  });

  /** A share is a sum over a sum; any other aggregate makes the ratio meaningless. */
  it('refuses percentOfTotal on a non-sum aggregate', async () => {
    const res = await addLimit(fakeManager(), { name: 'x', metric: 'marketValue', unit: 'percentOfTotal', aggregate: 'max', max: 5 });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/only makes sense on a sum/);
  });

  it('replaces a limit of the same name', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Cap', metric: 'marketValue', max: 5 });
    await addLimit(cm, { name: 'Cap', metric: 'marketValue', max: 10 });
    const ctx = await readDeskContext(cm);
    expect(ctx.limits).toHaveLength(1);
    expect(ctx.limits[0].max).toBe(10);
  });

  it('removes by name and reports an unknown one', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Cap', metric: 'marketValue', max: 5 });
    expect((await removeLimit(cm, { name: 'Cap' })).ok).toBe(true);
    expect((await removeLimit(cm, { name: 'Cap' })).ok).toBe(false);
  });

  it('lists what is set', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Cap', metric: 'marketValue', groupBy: 'issuer', unit: 'percentOfTotal', max: 5 });
    const res = await listLimits(cm);
    expect(res.summary).toContain('Cap');
    expect(res.summary).toContain('per issuer');
  });
});

describe('check_limits', () => {
  it('says nothing is set rather than implying everything passes', async () => {
    const res = await checkLimits(deps(fakeManager()), {});
    expect(res.ok).toBe(true);
    expect(res.summary).toMatch(/No limits are set/);
  });

  it('finds a per-issuer share breach and quantifies it', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Issuer cap', metric: 'marketValue', groupBy: 'issuer', unit: 'percentOfTotal', max: 50 });
    liveRows = [
      { issuer: 'ACME', marketValue: 60 },
      { issuer: 'B', marketValue: 40 },
    ];
    const res = await checkLimits(deps(cm), {});
    const data = res.data as { breaches: Array<{ group: string; value: number; by: number }> };
    // ACME is 60% of 100 against a 50% cap; B at 40% is inside it.
    expect(data.breaches).toHaveLength(1);
    expect(data.breaches[0].group).toBe('ACME');
    expect(data.breaches[0].value).toBe(60);
    expect(data.breaches[0].by).toBe(10);
    expect(res.summary).toContain('1 breach(es)');
  });

  it('passes when everything is inside its bound', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Issuer cap', metric: 'marketValue', groupBy: 'issuer', unit: 'percentOfTotal', max: 60 });
    liveRows = [{ issuer: 'A', marketValue: 50 }, { issuer: 'B', marketValue: 50 }];
    const res = await checkLimits(deps(cm), {});
    expect((res.data as { breaches: unknown[] }).breaches).toHaveLength(0);
    expect(res.summary).toMatch(/within bounds/i);
  });

  it('catches a minimum being undershot', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Min book', metric: 'marketValue', min: 500 });
    liveRows = [{ issuer: 'A', marketValue: 100 }];
    const res = await checkLimits(deps(cm), {});
    const b = (res.data as { breaches: Array<{ side: string; by: number }> }).breaches[0];
    expect(b.side).toBe('under');
    expect(b.by).toBe(400);
  });

  /** An ungrouped limit is about the book as a whole, not each book separately. */
  it('sums an ungrouped limit across the whole book', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Book cap', metric: 'marketValue', max: 150 });
    liveRows = [{ issuer: 'A', marketValue: 100 }, { issuer: 'B', marketValue: 100 }];
    const res = await checkLimits(deps(cm), {});
    const b = (res.data as { breaches: Array<{ value: number; group: null }> }).breaches[0];
    expect(b.value).toBe(200);
    expect(b.group).toBeNull();
  });

  /**
   * The worst possible failure here would be an unevaluated limit reading as a
   * passing one, so it is reported separately and labelled.
   */
  it('reports an unevaluatable limit as unknown, never as passing', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Bad column', metric: 'notAColumn', max: 5 });
    liveRows = [{ issuer: 'A', marketValue: 1 }];
    const res = await checkLimits(deps(cm), {});
    const data = res.data as { breaches: unknown[]; passed: string[]; unevaluated: string[] };
    expect(data.unevaluated).toHaveLength(1);
    expect(data.passed).toHaveLength(0);
    expect(res.summary).toMatch(/NOT EVALUATED \(treat as unknown, not as passing\)/);
  });

  it('refuses to divide by a zero total instead of reporting a false breach', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Share', metric: 'marketValue', groupBy: 'issuer', unit: 'percentOfTotal', max: 5 });
    liveRows = [{ issuer: 'A', marketValue: 0 }];
    const res = await checkLimits(deps(cm), {});
    expect((res.data as { unevaluated: string[] }).unevaluated[0]).toMatch(/total is zero/);
  });

  it('can check just one limit', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'A', metric: 'marketValue', max: 1 });
    await addLimit(cm, { name: 'B', metric: 'marketValue', max: 100000 });
    liveRows = [{ issuer: 'X', marketValue: 50 }];
    const res = await checkLimits(deps(cm), { name: 'B' });
    expect((res.data as { breaches: unknown[]; passed: string[] }).passed).toEqual(['B']);
  });

  it('ranks the biggest breach first', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Issuer cap', metric: 'marketValue', groupBy: 'issuer', unit: 'percentOfTotal', max: 10 });
    liveRows = [
      { issuer: 'BIG', marketValue: 70 },
      { issuer: 'MID', marketValue: 20 },
      { issuer: 'OK', marketValue: 10 },
    ];
    const res = await checkLimits(deps(cm), {});
    const groups = (res.data as { breaches: Array<{ group: string }> }).breaches.map((b) => b.group);
    expect(groups).toEqual(['BIG', 'MID']);
  });
});
