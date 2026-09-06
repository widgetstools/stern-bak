import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';

const BOOK = {
  id: 'grid-credit', configId: 'grid-credit', componentType: 'grid', componentSubType: 'credit',
  displayName: 'Credit', hostUrl: '', iconId: '', createdAt: '', type: 'internal' as const,
  usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '', singleton: true, asWindow: true,
};

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
  { colId: 'issuer', headerName: 'Issuer' },
  { colId: 'sector', headerName: 'Sector' },
  { colId: 'marketValue', headerName: 'Market Value', cellDataType: 'number' },
];
vi.mock('./columnResolver', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readColumnCatalogue: async () => CATALOGUE,
}));

import { simulateChange } from './simulateTools';
import { addLimit } from './deskTools';

function fakeManager() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    getConfig: vi.fn(async (id: string) => rows.get(id)),
    saveConfig: vi.fn(async (r: { configId: string }) => { rows.set(r.configId, r); }),
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

describe('simulate_change', () => {
  it('reports a limit a hypothetical position would break', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Book cap', metric: 'marketValue', max: 150 });
    liveRows = [{ issuer: 'A', sector: 'Tech', marketValue: 100 }];
    const res = await simulateChange(deps(cm), {
      addRows: [{ issuer: 'ACME', sector: 'Tech', marketValue: 100 }],
    });
    expect(res.ok).toBe(true);
    expect(res.summary).toContain('WOULD BREACH 1');
    expect(res.summary).toContain('Book cap');
  });

  it('says nothing new breaks when it does not', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Book cap', metric: 'marketValue', max: 1000 });
    liveRows = [{ issuer: 'A', sector: 'Tech', marketValue: 100 }];
    const res = await simulateChange(deps(cm), { addRows: [{ issuer: 'B', marketValue: 10 }] });
    expect(res.summary).toContain('No new breaches');
  });

  it('scales a subset with changePercent and a where clause', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Book cap', metric: 'marketValue', max: 150 });
    liveRows = [
      { issuer: 'A', sector: 'Tech', marketValue: 100 },
      { issuer: 'B', sector: 'Energy', marketValue: 20 },
    ];
    const res = await simulateChange(deps(cm), {
      adjustments: [{ column: 'marketValue', changePercent: 50, where: [{ column: 'sector', op: 'eq', value: 'Tech' }] }],
    });
    // Only Tech moves: 100 → 150, plus Energy's 20 = 170, over the 150 cap.
    expect(res.summary).toContain('1 row adjustment(s)');
    expect(res.summary).toContain('WOULD BREACH');
  });

  it('reports a breach the change would clear', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Book cap', metric: 'marketValue', max: 50 });
    liveRows = [{ issuer: 'A', sector: 'Tech', marketValue: 100 }];
    const res = await simulateChange(deps(cm), {
      adjustments: [{ column: 'marketValue', setTo: 10 }],
    });
    expect(res.summary).toContain('Would CLEAR');
    expect(res.summary).toContain('Already breaching before this');
  });

  /**
   * The one thing a model must not conclude from this tool is that a trade has
   * been placed or staged, so the disclaimer leads the summary.
   */
  it('states plainly that nothing was written', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Cap', metric: 'marketValue', max: 1 });
    liveRows = [{ issuer: 'A', marketValue: 100 }];
    const res = await simulateChange(deps(cm), { addRows: [{ issuer: 'B', marketValue: 1 }] });
    expect(res.summary.startsWith('Hypothetical only — nothing was written.')).toBe(true);
    expect(cm.saveConfig).toHaveBeenCalledTimes(1); // only the addLimit write
  });

  it('does not mutate the rows it was given', async () => {
    const cm = fakeManager();
    await addLimit(cm, { name: 'Cap', metric: 'marketValue', max: 1000 });
    liveRows = [{ issuer: 'A', marketValue: 100 }];
    await simulateChange(deps(cm), { adjustments: [{ column: 'marketValue', changeBy: 500 }] });
    expect(liveRows[0].marketValue).toBe(100);
  });

  describe('refusals', () => {
    it('refuses an empty simulation', async () => {
      const res = await simulateChange(deps(fakeManager()), {});
      expect(res.ok).toBe(false);
      expect(res.summary).toMatch(/Nothing to simulate/);
    });

    it('refuses an adjustment with two ways to change the number', async () => {
      liveRows = [{ issuer: 'A', marketValue: 1 }];
      const res = await simulateChange(deps(fakeManager()), {
        adjustments: [{ column: 'marketValue', changeBy: 1, setTo: 2 }],
      });
      expect(res.ok).toBe(false);
      expect(res.summary).toMatch(/exactly one of changeBy, changePercent or setTo/);
    });

    it('refuses an unknown column instead of adjusting nothing', async () => {
      liveRows = [{ issuer: 'A', marketValue: 1 }];
      const res = await simulateChange(deps(fakeManager()), {
        adjustments: [{ column: 'notAColumn', changeBy: 1 }],
      });
      expect(res.ok).toBe(false);
      expect(res.summary).toMatch(/No column matching/);
    });

    it('refuses a bad filter operator', async () => {
      liveRows = [{ issuer: 'A', marketValue: 1 }];
      const res = await simulateChange(deps(fakeManager()), {
        adjustments: [{ column: 'marketValue', changeBy: 1, where: [{ column: 'sector', op: 'nope', value: 1 }] }],
      });
      expect(res.ok).toBe(false);
      expect(res.summary).toMatch(/is not one of/);
    });

    it('says there is nothing to check against when no limits exist', async () => {
      liveRows = [{ issuer: 'A', marketValue: 1 }];
      const res = await simulateChange(deps(fakeManager()), { adjustments: [{ column: 'marketValue', changeBy: 1 }] });
      expect(res.ok).toBe(true);
      expect(res.summary).toMatch(/No limits are set/);
      expect(res.summary).toMatch(/Nothing was written/);
    });
  });
});
