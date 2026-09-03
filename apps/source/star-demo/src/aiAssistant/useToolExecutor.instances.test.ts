/**
 * Executor tests for addressing ONE WINDOW of a blotter rather than the
 * blotter as a whole. Split from `useToolExecutor.test.ts` for size; the mock
 * harness is duplicated because `vi.mock` hoists per file and cannot be shared.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager, ProfileSnapshot } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { dispatchTool, resolveInstancePin, type ToolExecutionContext } from './useToolExecutor';

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({ useDataServices: vi.fn() }));

vi.mock('@wellsfargo-starui/types', () => ({
  LOGGED_IN_USER_ID: 'dev1',
  getDefaultProviderConfig: (type: string) => ({ providerType: type, updateInterval: 2000 }),
  validateProviderConfig: (config: { providerType?: string }) =>
    config.providerType === 'mock'
      ? { isValid: true, errors: [] }
      : { isValid: false, errors: ['unsupported providerType in test'] },
}));

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
  deriveTemplateConfigId: (type: string, sub: string) => `${type}-${sub}`.toLowerCase(),
}));

const mockAddRegistryEntry = vi.fn();
const mockAddDockButton = vi.fn();
const mockRegistryEntryExists = vi.fn();
vi.mock('./registryOps', () => ({
  addRegistryEntry: (...args: unknown[]) => mockAddRegistryEntry(...args),
  addDockButton: (...args: unknown[]) => mockAddDockButton(...args),
  registryEntryExists: (...args: unknown[]) => mockRegistryEntryExists(...args),
  buildRegistryEntry: (spec: unknown) => spec,
}));

const GRID_ENTRY = {
  id: 'grid-test', configId: 'grid-test', componentType: 'grid', componentSubType: 'test',
  displayName: 'TestGrid', hostUrl: '/#/blotters/marketsgrid', iconId: '', createdAt: '',
  type: 'internal' as const, usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '',
  singleton: true, asWindow: false,
};

/** Builds a ToolExecutionContext over fake ConfigManager + provider-store doubles. */
function fakeCtx() {
  const list = vi.fn().mockResolvedValue([]);
  const save = vi.fn().mockResolvedValue(undefined);
  const loadGridLevelData = vi.fn().mockResolvedValue(null);
  const saveGridLevelData = vi.fn().mockResolvedValue(undefined);
  // Instance rows cloned from the template at dock-launch time. Empty by
  // default — the template-only case.
  const findByComponentType = vi.fn().mockResolvedValue([]);
  const storeList = vi.fn().mockResolvedValue([]);
  const storeGet = vi.fn().mockResolvedValue(null);
  const storeSave = vi.fn().mockResolvedValue({});
  const ctx: ToolExecutionContext = {
    configManager: {
      profiles: { list, save, loadGridLevelData, saveGridLevelData },
      findByComponentType,
    } as unknown as ConfigManager,
    configStore: { list: storeList, get: storeGet, save: storeSave } as unknown as DataProviderConfigStore,
    appId: 'Star-Demo',
  };
  return { ctx, list, save, loadGridLevelData, saveGridLevelData, findByComponentType, storeList, storeGet, storeSave };
}

/**
 * `list_grid_instances` hands back window ids, and a scoped panel knows its
 * own — but every tool took a registry id, so those ids were a dead end. Both
 * forms now resolve to (blotter, window).
 */
describe('resolveInstancePin', () => {
  const INSTANCE = 'dev1grid-test-1700000000000';

  function manager(rows: Record<string, { componentType?: string; componentSubType?: string }> = {}) {
    return { getConfig: vi.fn(async (id: string) => rows[id]) } as unknown as ConfigManager;
  }

  beforeEach(() => {
    mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [GRID_ENTRY] });
  });

  it('leaves a plain registry id alone', async () => {
    const res = await resolveInstancePin(manager(), { targetGridId: 'grid-test' });
    expect(res.ok === true && res.args.targetGridId).toBe('grid-test');
    expect(res.ok === true && res.pinnedInstanceId).toBeUndefined();
  });

  /** The natural next move after list_grid_instances. */
  it('accepts a window id as targetGridId, normalising it to the blotter', async () => {
    const rows = { [INSTANCE]: { componentType: 'grid', componentSubType: 'test' } };
    const res = await resolveInstancePin(manager(rows), { targetGridId: INSTANCE });
    expect(res.ok === true && res.args.targetGridId).toBe('grid-test');
    expect(res.ok === true && res.pinnedInstanceId).toBe(INSTANCE);
  });

  it('accepts an explicit instanceId alongside the blotter', async () => {
    const rows = { [INSTANCE]: { componentType: 'grid', componentSubType: 'test' } };
    const res = await resolveInstancePin(manager(rows), { targetGridId: 'grid-test', instanceId: INSTANCE });
    expect(res.ok === true && res.pinnedInstanceId).toBe(INSTANCE);
  });

  /** A typo here would silently rewrite a different window's config. */
  it('refuses an instanceId that belongs to another blotter', async () => {
    mockLoadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [GRID_ENTRY, { ...GRID_ENTRY, id: 'grid-axe', configId: 'grid-axe', componentSubType: 'axe', displayName: 'Axe', singleton: false }],
    });
    const rows = { 'dev1grid-axe-1': { componentType: 'grid', componentSubType: 'axe' } };
    const res = await resolveInstancePin(manager(rows), { targetGridId: 'grid-test', instanceId: 'dev1grid-axe-1' });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.summary).toContain('belongs to "Axe"');
  });

  it('refuses an instanceId nothing knows about', async () => {
    const res = await resolveInstancePin(manager(), { targetGridId: 'grid-test', instanceId: 'ghost' });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.summary).toContain('list_grid_instances');
  });

  /** A singleton's window IS its template row, so nothing gets narrowed. */
  it('pins nothing for a singleton', async () => {
    const res = await resolveInstancePin(manager(), { targetGridId: 'grid-test', instanceId: 'grid-test' });
    expect(res.ok === true && res.pinnedInstanceId).toBeUndefined();
  });

  it('passes an unresolvable targetGridId through for the handler to report', async () => {
    const res = await resolveInstancePin(manager(), { targetGridId: 'nope' });
    expect(res.ok === true && res.args.targetGridId).toBe('nope');
  });

  // ── configId is the identifier ──────────────────────────────────────

  /** A name is what the user says, not what a tool takes: refuse, and hand
   *  back the configId so the model can retry correctly. */
  it('refuses a display name as targetGridId and names the real configId', async () => {
    const res = await resolveInstancePin(manager(), { targetGridId: 'TestGrid' });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.summary).toContain('display name, not a configId');
    expect(res.ok === false && res.summary).toContain('"grid-test"');
  });

  it('matches the display name case-insensitively when refusing', async () => {
    const res = await resolveInstancePin(manager(), { targetGridId: 'testgrid' });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.summary).toContain('"grid-test"');
  });

  /** The registry `id` and the `configId` are the same string for everything
   *  this platform creates — but the configId is the one every profile read
   *  and write is keyed on, so it is what handlers must see even when an
   *  entry's two ids differ. */
  it('normalises to the configId, not the registry id, when the two differ', async () => {
    mockLoadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [{ ...GRID_ENTRY, id: 'legacy-registry-id', configId: 'grid-test' }],
    });
    const byRegistryId = await resolveInstancePin(manager(), { targetGridId: 'legacy-registry-id' });
    expect(byRegistryId.ok === true && byRegistryId.args.targetGridId).toBe('grid-test');
    const byConfigId = await resolveInstancePin(manager(), { targetGridId: 'grid-test' });
    expect(byConfigId.ok === true && byConfigId.args.targetGridId).toBe('grid-test');
  });

  it('prefers a configId match over a registry-id match when both could apply', async () => {
    mockLoadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [
        { ...GRID_ENTRY, id: 'grid-other', configId: 'grid-test', displayName: 'Right one' },
        { ...GRID_ENTRY, id: 'grid-test', configId: 'grid-shadow', displayName: 'Wrong one' },
      ],
    });
    const res = await resolveInstancePin(manager(), { targetGridId: 'grid-test' });
    expect(res.ok === true && res.args.targetGridId).toBe('grid-test');
  });
});

describe('dispatchTool with a pinned window', () => {
  const INSTANCE = 'dev1grid-test-1700000000000';

  beforeEach(() => {
    mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [GRID_ENTRY] });
  });

  it('writes only that window, and says the template was skipped', async () => {
    const { ctx, list, save, findByComponentType } = fakeCtx();
    list.mockResolvedValue([]);
    findByComponentType.mockResolvedValue([
      { configId: INSTANCE, componentType: 'grid', componentSubType: 'test', isTemplate: false },
      { configId: 'dev1grid-test-1800000000000', componentType: 'grid', componentSubType: 'test', isTemplate: false },
    ]);
    (ctx.configManager as unknown as { getConfig: unknown }).getConfig = vi.fn(async (id: string) =>
      id === INSTANCE ? { componentType: 'grid', componentSubType: 'test' } : undefined,
    );

    const result = await dispatchTool('update_module_settings', ctx, {
      targetGridId: 'grid-test', instanceId: INSTANCE, moduleId: 'general-settings', settings: { rowHeight: 30 },
    });

    expect(result.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ instanceId: INSTANCE });
    expect(result.summary).toContain('that window only');
  });

  /**
   * Without a pin the request is about the COMPONENT, so it writes the template
   * and leaves the running instance alone — the open window is not the thing
   * being configured. Naming a window is what scopes a change to it.
   */
  it('writes the template, not the open instance, when no window is named', async () => {
    const { ctx, list, save, findByComponentType } = fakeCtx();
    list.mockResolvedValue([]);
    findByComponentType.mockResolvedValue([
      { configId: INSTANCE, componentType: 'grid', componentSubType: 'test', isTemplate: false },
    ]);

    await dispatchTool('update_module_settings', ctx, {
      targetGridId: 'grid-test', moduleId: 'general-settings', settings: { rowHeight: 30 },
    });

    expect(save.mock.calls.map((c) => (c[0] as { instanceId: string }).instanceId)).toEqual(['grid-test']);
  });

  /** A locked panel is judged on the blotter an id belongs to, not the raw
   *  string — otherwise a window id would read as a foreign grid. */
  it('accepts one of the locked blotter\'s own windows', async () => {
    const { ctx } = fakeCtx();
    (ctx.configManager as unknown as { getConfig: unknown }).getConfig = vi.fn(async () => ({
      componentType: 'grid', componentSubType: 'test',
    }));

    const result = await dispatchTool(
      'update_module_settings',
      { ...ctx, lockedGridId: 'grid-test' },
      { targetGridId: INSTANCE, moduleId: 'general-settings', settings: { rowHeight: 30 } },
    );

    expect(result.ok).toBe(true);
  });
});

