import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

const GRID = {
  id: 'grid-pos', configId: 'grid-pos', componentType: 'grid', componentSubType: 'pos',
  displayName: 'Positions', hostUrl: '', iconId: '', createdAt: '', type: 'internal' as const,
  usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '', singleton: true, asWindow: true,
};

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
}));

const mockAddRegistryEntry = vi.fn();
const mockAddDockButton = vi.fn();
const mockRegistryEntryExists = vi.fn();
vi.mock('./registryOps', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  addRegistryEntry: (...a: unknown[]) => mockAddRegistryEntry(...a),
  addDockButton: (...a: unknown[]) => mockAddDockButton(...a),
  registryEntryExists: (...a: unknown[]) => mockRegistryEntryExists(...a),
}));

// Preflight has its own suite; here it is stubbed to "everything draws" so
// these tests stay about persistence, registration and the dock.
const mockPreflight = vi.fn();
vi.mock('./reportPreflight', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  preflightReport: (...a: unknown[]) => mockPreflight(...a),
}));

vi.mock('./launchComponent', () => ({
  launchBlotter: vi.fn().mockResolvedValue({ ok: true }),
  describeLaunch: () => '',
}));

import { saveDashboard, readDashboard, saveDashboardLayout } from './dashboardTools';

function fakeManager() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    getConfig: vi.fn(async (id: string) => rows.get(id)),
    saveConfig: vi.fn(async (r: { configId: string }) => { rows.set(r.configId, r); }),
    findByComponentType: vi.fn(async () => []),
    getConfigsByUser: vi.fn(async () => [...rows.values()]),
    deleteConfig: vi.fn(async (id: string) => { rows.delete(id); }),
  } as unknown as ConfigManager;
}

const SPEC = { title: 'Trader Dashboard', blocks: [{ kind: 'commentary', text: 'Hello' }] };

const depsFor = (configManager: ConfigManager) => ({
  configManager,
  configStore: {} as unknown as Parameters<typeof saveDashboard>[0]['configStore'],
});

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [GRID] });
  mockAddRegistryEntry.mockReset().mockResolvedValue(undefined);
  mockAddDockButton.mockReset().mockResolvedValue(true);
  mockRegistryEntryExists.mockReset().mockResolvedValue(false);
  mockPreflight.mockReset().mockResolvedValue({
    ok: true,
    value: { verdicts: [], broken: [], empty: [], rowCount: 10 },
  });
});

describe('save_dashboard', () => {
  /**
   * The bug this pins: a dashboard opened from the dock arrives with NO
   * blotter in context. Saving the spec alone left the window unable to
   * resolve which grid to read, so it fetched no rows and rendered empty.
   */
  it('refuses to save without the blotter it reads', async () => {
    const res = await saveDashboard(depsFor(fakeManager()), 'Star-Demo', { name: 'D', spec: SPEC });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/targetGridId/);
    expect(res.summary).toMatch(/opens with no data/);
  });

  it('refuses a blotter that is not registered', async () => {
    const res = await saveDashboard(depsFor(fakeManager()), 'Star-Demo', {
      name: 'D', spec: SPEC, targetGridId: 'grid-nope',
    });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/No grid registered/);
  });

  it('stores the blotter alongside the spec', async () => {
    const cm = fakeManager();
    const res = await saveDashboard(depsFor(cm), 'Star-Demo', {
      name: 'Trader Dashboard', spec: SPEC, targetGridId: 'grid-pos', openNow: false,
    });
    expect(res.ok).toBe(true);

    const loaded = await readDashboard(cm, 'dashboard-trader-dashboard');
    expect(loaded?.gridId).toBe('grid-pos');
    expect(loaded?.spec.title).toBe('Trader Dashboard');
  });

  /** Belt and braces: the URL carries it too, so the existing resolution path
   *  works with no special case for dashboards. */
  it('puts the blotter in the launch URL as well', async () => {
    await saveDashboard(depsFor(fakeManager()), 'Star-Demo', {
      name: 'D', spec: SPEC, targetGridId: 'grid-pos', openNow: false,
    });
    const entry = mockAddRegistryEntry.mock.calls[0][0] as { hostUrl: string };
    expect(entry.hostUrl).toContain('dashboard=dashboard-d');
    expect(entry.hostUrl).toContain('grid=grid-pos');
  });

  it('files it under Assets → Dashboards', async () => {
    await saveDashboard(depsFor(fakeManager()), 'Star-Demo', {
      name: 'D', spec: SPEC, targetGridId: 'grid-pos', openNow: false,
    });
    expect(mockAddDockButton).toHaveBeenCalledWith(
      expect.objectContaining({ group: 'Assets', subGroup: 'Dashboards' }),
    );
  });

  it('refuses a duplicate name rather than overwriting', async () => {
    mockRegistryEntryExists.mockResolvedValue(true);
    const res = await saveDashboard(depsFor(fakeManager()), 'Star-Demo', {
      name: 'D', spec: SPEC, targetGridId: 'grid-pos',
    });
    expect(res.ok).toBe(false);
    expect(res.summary).toMatch(/already exists/);
  });
});

describe('saveDashboardLayout', () => {
  async function saved() {
    const cm = fakeManager();
    await saveDashboard(depsFor(cm), 'Star-Demo', {
      name: 'D', spec: SPEC, targetGridId: 'grid-pos', openNow: false,
    });
    return cm;
  }

  it('rewrites only the blocks, keeping the binding and the title', async () => {
    const cm = await saved();
    const ok = await saveDashboardLayout(cm, 'dashboard-d', [
      { kind: 'commentary', text: 'Moved', region: 'right' },
    ] as never);
    expect(ok).toBe(true);

    const loaded = await readDashboard(cm, 'dashboard-d');
    expect(loaded?.gridId).toBe('grid-pos');
    expect(loaded?.spec.title).toBe('Trader Dashboard');
    expect(loaded?.spec.blocks[0]).toMatchObject({ region: 'right' });
  });

  it('does not write a layout that fails validation', async () => {
    const cm = await saved();
    const ok = await saveDashboardLayout(cm, 'dashboard-d', [{ kind: 'nonsense' }] as never);
    expect(ok).toBe(false);
    const loaded = await readDashboard(cm, 'dashboard-d');
    expect(loaded?.spec.blocks[0]).toMatchObject({ kind: 'commentary' });
  });

  it('reports failure for a dashboard that no longer exists', async () => {
    expect(await saveDashboardLayout(fakeManager(), 'gone', [] as never)).toBe(false);
  });
});

/**
 * A SAVED dashboard is worse to get wrong than an ad-hoc report: it goes on
 * the dock and is opened again tomorrow. So a block that can never draw stops
 * the save, rather than being found later by whoever opens it.
 */
describe('save_dashboard — preflight', () => {
  it('refuses to save a dashboard whose blocks cannot draw', async () => {
    mockPreflight.mockResolvedValue({
      ok: true,
      value: {
        verdicts: [],
        broken: [{ index: 0, kind: 'chart', title: 'MV by desk', status: 'broken', reason: 'no numeric column to plot' }],
        empty: [],
        rowCount: 10,
      },
    });
    const res = await saveDashboard(depsFor(fakeManager()), 'Star-Demo', {
      name: 'D', spec: SPEC, targetGridId: 'grid-pos',
    });
    expect(res.ok).toBe(false);
    expect(res.summary).toContain('would render nothing');
    expect(res.summary).toContain('MV by desk');
    expect(mockAddRegistryEntry).not.toHaveBeenCalled();
  });

  it('saves a dashboard whose queries are valid but currently empty, and says so', async () => {
    mockPreflight.mockResolvedValue({
      ok: true,
      value: {
        verdicts: [],
        broken: [],
        empty: [{ index: 0, kind: 'table', title: 'Near maturities', status: 'empty' }],
        rowCount: 10,
      },
    });
    const res = await saveDashboard(depsFor(fakeManager()), 'Star-Demo', {
      name: 'D', spec: SPEC, targetGridId: 'grid-pos', openNow: false,
    });
    expect(res.ok).toBe(true);
    expect(res.summary).toContain('match no rows right now');
  });
});
