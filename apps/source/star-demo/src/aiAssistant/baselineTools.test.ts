import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';

const ENTRY = {
  id: 'grid-pos', configId: 'grid-pos', componentType: 'grid', componentSubType: 'pos',
  displayName: 'Positions', hostUrl: '', iconId: '', createdAt: '',
  type: 'internal' as const, usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '',
  singleton: true, asWindow: true,
};

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
}));

const CATALOGUE = [
  { colId: 'cusip', headerName: 'Cusip' },
  { colId: 'marketValue', headerName: 'Market Value', cellDataType: 'number' },
  { colId: 'pv01', headerName: 'PV01', cellDataType: 'number' },
  { colId: 'sector', headerName: 'Sector' },
];
vi.mock('./columnResolver', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readColumnCatalogue: async () => CATALOGUE,
}));

let liveRows: Array<Record<string, unknown>> = [];
vi.mock('./dataAccess', () => ({
  fetchGridRows: async () => ({
    ok: true,
    value: { rows: liveRows, source: 'live', providerId: 'p1', providerName: 'Feed', provenance: 'live from "Feed"' },
  }),
}));

import { captureBaseline, compareToBaseline, listBaselines, explainChange } from './baselineTools';

/** In-memory ConfigManager: enough of the row API for baselines. */
function fakeManager(keyColumn: string | null = 'cusip') {
  const rows = new Map<string, Record<string, unknown>>();
  const cm = {
    getConfig: vi.fn(async (id: string) => rows.get(id)),
    saveConfig: vi.fn(async (row: { configId: string }) => { rows.set(row.configId, row); }),
    findByComponentType: vi.fn(async (type: string, sub: string) =>
      [...rows.values()].filter(
        (r) => (r as { componentType: string }).componentType === type
          && (r as { componentSubType: string }).componentSubType === sub,
      ),
    ),
    profiles: {
      loadGridLevelData: vi.fn(async () => ({ provider: { liveProviderId: 'p1' } })),
      list: vi.fn(async () => []),
      save: vi.fn(),
      saveGridLevelData: vi.fn(),
    },
  } as unknown as ConfigManager;
  const store = {
    get: vi.fn(async () => ({ name: 'Feed', config: keyColumn ? { keyColumn } : {} })),
  } as unknown as DataProviderConfigStore;
  return { configManager: cm, configStore: store };
}

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [ENTRY] });
  liveRows = [];
});

describe('capture_baseline', () => {
  it('captures the numeric columns keyed by the provider keyColumn', async () => {
    liveRows = [{ cusip: 'A', marketValue: 100, pv01: 10 }];
    const deps = fakeManager();
    const res = await captureBaseline(deps, { targetGridId: 'grid-pos', name: 'open' });
    expect(res.ok).toBe(true);
    expect(res.summary).toContain('1 row(s) keyed by cusip');
    const saved = (deps.configManager.saveConfig as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.configId).toBe('baseline::grid-pos::open');
    expect(saved.payload.columns).toEqual(['marketValue', 'pv01']);
    expect(saved.payload.rows).toEqual({ A: { marketValue: 100, pv01: 10 } });
  });

  /**
   * Without a stable key there is no way to say "this row moved" rather than
   * "one left and another arrived" — row order is not stable on a live feed,
   * so this refuses instead of matching by position.
   */
  it('refuses when the provider declares no keyColumn', async () => {
    liveRows = [{ cusip: 'A', marketValue: 100 }];
    const res = await captureBaseline(fakeManager(null), { targetGridId: 'grid-pos' });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/no keyColumn/);
  });

  it('takes explicit columns the way the user names them', async () => {
    liveRows = [{ cusip: 'A', marketValue: 100, pv01: 10 }];
    const deps = fakeManager();
    await captureBaseline(deps, { targetGridId: 'grid-pos', columns: ['Market Value'] });
    const saved = (deps.configManager.saveConfig as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.payload.columns).toEqual(['marketValue']);
  });

  it('re-capturing the same name overwrites rather than duplicating', async () => {
    liveRows = [{ cusip: 'A', marketValue: 100, pv01: 1 }];
    const deps = fakeManager();
    await captureBaseline(deps, { targetGridId: 'grid-pos', name: 'open' });
    liveRows = [{ cusip: 'A', marketValue: 200, pv01: 1 }];
    await captureBaseline(deps, { targetGridId: 'grid-pos', name: 'open' });
    const listed = await listBaselines(deps.configManager, { targetGridId: 'grid-pos' });
    expect((listed.data as unknown[]).length).toBe(1);
  });
});

describe('compare_to_baseline', () => {
  async function withBaseline(before: Array<Record<string, unknown>>) {
    const deps = fakeManager();
    liveRows = before;
    await captureBaseline(deps, { targetGridId: 'grid-pos', name: 'open' });
    return deps;
  }

  it('reports absolute and percent moves, biggest first', async () => {
    const deps = await withBaseline([
      { cusip: 'A', marketValue: 100, pv01: 10 },
      { cusip: 'B', marketValue: 100, pv01: 10 },
    ]);
    liveRows = [
      { cusip: 'A', marketValue: 110, pv01: 10 },
      { cusip: 'B', marketValue: 150, pv01: 10 },
    ];
    const res = await compareToBaseline(deps, { targetGridId: 'grid-pos', name: 'open' });
    expect(res.ok).toBe(true);
    const table = (res.data as { table: { rows: Array<Record<string, unknown>> } }).table;
    // B moved +50, A moved +10 — the answer to "what changed" is a ranking.
    expect(table.rows[0].cusip).toBe('B');
    expect(table.rows[0]['marketValue Δ']).toBe(50);
    expect(table.rows[0]['marketValue Δ%']).toBe(50);
    expect(table.rows[1]['marketValue Δ']).toBe(10);
  });

  it('leaves unchanged rows out by default', async () => {
    const deps = await withBaseline([{ cusip: 'A', marketValue: 100, pv01: 10 }]);
    liveRows = [{ cusip: 'A', marketValue: 100, pv01: 10 }];
    const res = await compareToBaseline(deps, { targetGridId: 'grid-pos', name: 'open' });
    expect((res.data as { table: { rows: unknown[] } }).table.rows).toHaveLength(0);
    expect(res.summary).toContain('0 row(s) changed');
  });

  it('includes unchanged rows when asked', async () => {
    const deps = await withBaseline([{ cusip: 'A', marketValue: 100, pv01: 10 }]);
    liveRows = [{ cusip: 'A', marketValue: 100, pv01: 10 }];
    const res = await compareToBaseline(deps, { targetGridId: 'grid-pos', name: 'open', includeUnchanged: true });
    expect((res.data as { table: { rows: unknown[] } }).table.rows).toHaveLength(1);
  });

  /** A disappearance is usually the most interesting thing that happened. */
  it('reports rows that appeared and rows that dropped out', async () => {
    const deps = await withBaseline([{ cusip: 'A', marketValue: 100, pv01: 1 }]);
    liveRows = [{ cusip: 'B', marketValue: 50, pv01: 1 }];
    const res = await compareToBaseline(deps, { targetGridId: 'grid-pos', name: 'open' });
    expect(res.summary).toContain('1 added');
    expect(res.summary).toContain('1 removed');
    const statuses = (res.data as { table: { rows: Array<{ status: string }> } }).table.rows.map((r) => r.status);
    expect(statuses.sort()).toEqual(['added', 'removed']);
  });

  it('filters out small moves when a threshold is given', async () => {
    const deps = await withBaseline([
      { cusip: 'A', marketValue: 100, pv01: 1 },
      { cusip: 'B', marketValue: 100, pv01: 1 },
    ]);
    liveRows = [
      { cusip: 'A', marketValue: 101, pv01: 1 },   // +1%
      { cusip: 'B', marketValue: 150, pv01: 1 },   // +50%
    ];
    const res = await compareToBaseline(deps, { targetGridId: 'grid-pos', name: 'open', minChangePercent: 10 });
    const rows = (res.data as { table: { rows: Array<{ cusip: string }> } }).table.rows;
    expect(rows.map((r) => r.cusip)).toEqual(['B']);
  });

  it('tracks a non-numeric change as a was/now pair', async () => {
    const deps = fakeManager();
    liveRows = [{ cusip: 'A', marketValue: 1, pv01: 1, rating: 'AAA' }];
    await captureBaseline(deps, { targetGridId: 'grid-pos', name: 'open', columns: ['cusip'] });
    liveRows = [{ cusip: 'A', marketValue: 1, pv01: 1, rating: 'CCC' }];
    const res = await compareToBaseline(deps, { targetGridId: 'grid-pos', name: 'open' });
    // Captured `cusip` only, and it didn't change — so nothing is reported.
    expect(res.summary).toContain('0 row(s) changed');
  });

  describe('refusals', () => {
    it('says there is no baseline rather than guessing at movement', async () => {
      const res = await compareToBaseline(fakeManager(), { targetGridId: 'grid-pos', name: 'nope' });
      expect(res.ok).toBe(false);
      expect(res.summary).toMatch(/No baseline called "nope"/);
      expect(res.summary).toMatch(/Capture one first/);
    });

    it('names the baselines that do exist', async () => {
      const deps = await withBaseline([{ cusip: 'A', marketValue: 1, pv01: 1 }]);
      const res = await compareToBaseline(deps, { targetGridId: 'grid-pos', name: 'close' });
      expect(res.summary).toContain('Available: open');
    });

    it('refuses a column the baseline never captured', async () => {
      const deps = fakeManager();
      liveRows = [{ cusip: 'A', marketValue: 1, pv01: 1 }];
      await captureBaseline(deps, { targetGridId: 'grid-pos', name: 'open', columns: ['Market Value'] });
      const res = await compareToBaseline(deps, { targetGridId: 'grid-pos', name: 'open', columns: ['PV01'] });
      expect(res.ok).toBe(false);
      expect(res.summary).toMatch(/doesn't hold pv01/);
    });
  });
});

describe('list_baselines', () => {
  it('is empty before anything is captured', async () => {
    const res = await listBaselines(fakeManager().configManager, { targetGridId: 'grid-pos' });
    expect(res.ok).toBe(true);
    expect(res.data).toEqual([]);
  });

  it('names each baseline with when it was taken', async () => {
    const deps = fakeManager();
    liveRows = [{ cusip: 'A', marketValue: 1, pv01: 1 }];
    await captureBaseline(deps, { targetGridId: 'grid-pos', name: 'open' });
    const res = await listBaselines(deps.configManager, { targetGridId: 'grid-pos' });
    const listed = res.data as Array<{ name: string; rowCount: number }>;
    expect(listed[0].name).toBe('open');
    expect(listed[0].rowCount).toBe(1);
  });
});

/**
 * Attribution is a calculation, not a judgement: each row's delta on one metric
 * is bucketed by a dimension and ranked. The parts must reconcile to the whole,
 * which is why appeared/disappeared rows are part of the answer.
 */
describe('explain_change', () => {
  async function withBaseline(before: Array<Record<string, unknown>>, columns?: string[]) {
    const deps = fakeManager();
    liveRows = before;
    await captureBaseline(deps, { targetGridId: 'grid-pos', name: 'open', columns });
    return deps;
  }

  it('attributes a move to the dimension that caused it, ranked', async () => {
    const deps = await withBaseline([
      { cusip: 'A', marketValue: 100, pv01: 1, sector: 'Tech' },
      { cusip: 'B', marketValue: 100, pv01: 1, sector: 'Energy' },
    ]);
    liveRows = [
      { cusip: 'A', marketValue: 130, pv01: 1, sector: 'Tech' },
      { cusip: 'B', marketValue: 90, pv01: 1, sector: 'Energy' },
    ];
    const res = await explainChange(deps, { targetGridId: 'grid-pos', metric: 'marketValue', by: 'sector', name: 'open' });
    expect(res.ok).toBe(true);
    const rows = (res.data as { table: { rows: Array<Record<string, unknown>> } }).table.rows;
    expect(rows[0].sector).toBe('Tech');
    expect(rows[0]['marketValue Δ']).toBe(30);
    expect(rows[1]['marketValue Δ']).toBe(-10);
    // Net move is +20, so Tech's +30 is 150% of it and Energy's -10 is -50%.
    expect(rows[0]['share %']).toBe(150);
    expect(res.summary).toContain('moved +20');
  });

  /** A position closing is one of the commonest reasons a total moved. */
  it('counts rows that appeared and disappeared in the decomposition', async () => {
    const deps = await withBaseline([{ cusip: 'A', marketValue: 100, pv01: 1, sector: 'Tech' }], ['Market Value', 'sector']);
    liveRows = [{ cusip: 'B', marketValue: 40, pv01: 1, sector: 'Energy' }];
    const res = await explainChange(deps, { targetGridId: 'grid-pos', metric: 'marketValue', by: 'sector', name: 'open' });
    const rows = (res.data as { table: { rows: Array<Record<string, unknown>> } }).table.rows;
    const bySector = Object.fromEntries(rows.map((r) => [r.sector, r['marketValue Δ']]));
    expect(bySector).toEqual({ Tech: -100, Energy: 40 });
    expect(res.summary).toContain('moved -60');
  });

  it('buckets disappeared rows honestly when the baseline lacks the grouping column', async () => {
    const deps = await withBaseline([{ cusip: 'A', marketValue: 100, pv01: 1, sector: 'Tech' }], ['Market Value']);
    liveRows = [];
    const res = await explainChange(deps, { targetGridId: 'grid-pos', metric: 'marketValue', by: 'sector', name: 'open' });
    const rows = (res.data as { table: { rows: Array<Record<string, unknown>> } }).table.rows;
    expect(rows[0].sector).toBe('(rows that disappeared)');
    expect(res.summary).toMatch(/didn't capture sector/);
  });

  it('refuses a metric the baseline never captured', async () => {
    const deps = await withBaseline([{ cusip: 'A', marketValue: 1, pv01: 1, sector: 'Tech' }], ['Market Value']);
    const res = await explainChange(deps, { targetGridId: 'grid-pos', metric: 'PV01', by: 'sector', name: 'open' });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/didn't capture pv01/);
  });

  it('needs a baseline before it can explain anything', async () => {
    const res = await explainChange(fakeManager(), { targetGridId: 'grid-pos', metric: 'marketValue', by: 'sector' });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/no earlier state/);
  });

  it('reports nothing moved rather than inventing a cause', async () => {
    const deps = await withBaseline([{ cusip: 'A', marketValue: 100, pv01: 1, sector: 'Tech' }]);
    liveRows = [{ cusip: 'A', marketValue: 100, pv01: 1, sector: 'Tech' }];
    const res = await explainChange(deps, { targetGridId: 'grid-pos', metric: 'marketValue', by: 'sector', name: 'open' });
    expect(res.summary).toContain('Nothing moved');
  });
});
