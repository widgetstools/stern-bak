import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager, ProfileSnapshot } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { dispatchTool, applyGridScope, resolveInstancePin, type ToolExecutionContext } from './useToolExecutor';

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
  // Real value, not a stand-in: the tests below assert blotters land under
  // this exact menu, so a drifting constant should fail them.
  BLOTTER_DOCK_GROUP: 'Assets',
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
  // Resolves a per-window instance id to its cloned row's component identity —
  // only needed by resolveGridForInstance, so undefined (no row) by default.
  const getConfig = vi.fn().mockResolvedValue(undefined);
  const storeList = vi.fn().mockResolvedValue([]);
  const storeGet = vi.fn().mockResolvedValue(null);
  const storeSave = vi.fn().mockResolvedValue({});
  const ctx: ToolExecutionContext = {
    configManager: {
      profiles: { list, save, loadGridLevelData, saveGridLevelData },
      findByComponentType,
      getConfig,
    } as unknown as ConfigManager,
    configStore: { list: storeList, get: storeGet, save: storeSave } as unknown as DataProviderConfigStore,
    appId: 'Star-Demo',
  };
  return { ctx, list, save, loadGridLevelData, saveGridLevelData, findByComponentType, getConfig, storeList, storeGet, storeSave };
}

/**
 * A scoped panel (opened by a blotter's wand button) must be a real boundary,
 * not a request in the prompt — a model that ignores the instruction still
 * can't reach another blotter.
 */
describe('applyGridScope', () => {
  it('fills in the selected grid when a call names none', () => {
    const res = applyGridScope({ defaultGridId: 'grid-test' }, { moduleId: 'general-settings' });
    expect(res.ok === true && res.args.targetGridId).toBe('grid-test');
  });

  it('never overrides a grid the model named explicitly', () => {
    const res = applyGridScope({ defaultGridId: 'grid-test' }, { targetGridId: 'grid-other' });
    expect(res.ok === true && res.args.targetGridId).toBe('grid-other');
  });

  it('refuses a locked panel reaching another blotter, and says what to do', () => {
    const res = applyGridScope({ lockedGridId: 'grid-axe' }, { targetGridId: 'grid-test' });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.summary).toContain('grid-axe');
    expect(res.ok === false && res.summary).toContain("blotter's toolbar");
  });

  it('supplies the locked grid to calls that omit one', () => {
    const res = applyGridScope({ lockedGridId: 'grid-axe' }, {});
    expect(res.ok === true && res.args.targetGridId).toBe('grid-axe');
  });

  it('allows the locked grid named explicitly', () => {
    const res = applyGridScope({ lockedGridId: 'grid-axe' }, { targetGridId: 'grid-axe' });
    expect(res.ok).toBe(true);
  });

  it('leaves calls alone when the panel has no scope at all', () => {
    const res = applyGridScope({}, { providerId: 'p1' });
    expect(res).toEqual({ ok: true, args: { providerId: 'p1' } });
  });
});

describe('dispatchTool', () => {
  it('enforces panel scope before the handler runs', async () => {
    const { ctx, save } = fakeCtx();
    const scoped = { ...ctx, lockedGridId: 'grid-axe' };

    const result = await dispatchTool('set_column_layout', scoped, { targetGridId: 'grid-test', hide: ['isin'] });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('scoped to "grid-axe"');
    expect(save).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [GRID_ENTRY] });
    mockAddRegistryEntry.mockReset().mockResolvedValue(undefined);
    mockAddDockButton.mockReset().mockResolvedValue(undefined);
    mockRegistryEntryExists.mockReset().mockResolvedValue(false);
  });

  it('list_grids returns only componentType "grid" entries', async () => {
    mockLoadRegistryConfig.mockResolvedValue({
      version: 2,
      entries: [GRID_ENTRY, { ...GRID_ENTRY, id: 'ai-assistant', componentType: 'tool', displayName: 'AI Assistant' }],
    });
    const { ctx } = fakeCtx();

    const result = await dispatchTool('list_grids', ctx, {});

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([{ id: 'grid-test', displayName: 'TestGrid' }]);
  });

  it('list_data_providers reads through the ConfigManager-backed store', async () => {
    const { ctx, storeList } = fakeCtx();
    storeList.mockResolvedValue([{ name: 'Positions', providerType: 'mock', providerId: 'p1' }]);

    const result = await dispatchTool('list_data_providers', ctx, {});

    expect(storeList).toHaveBeenCalledWith('dev1', { includeAppData: true });
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('Positions');
  });

  it('get_grid_columns resolves the bound provider and reads its columnDefinitions', async () => {
    const { ctx, loadGridLevelData, storeGet } = fakeCtx();
    loadGridLevelData.mockResolvedValue({ provider: { liveProviderId: 'dp-1' } });
    storeGet.mockResolvedValue({ config: { columnDefinitions: [{ field: 'price', headerName: 'Price', cellDataType: 'number' }] } });

    const result = await dispatchTool('get_grid_columns', ctx, { targetGridId: 'grid-test' });

    expect(loadGridLevelData).toHaveBeenCalledWith({ instanceId: 'grid-test' });
    expect(storeGet).toHaveBeenCalledWith('dp-1');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([{ colId: 'price', headerName: 'Price', cellDataType: 'number' }]);
  });

  it('get_grid_columns rejects an unknown targetGridId without touching the store', async () => {
    const { ctx, loadGridLevelData } = fakeCtx();

    const result = await dispatchTool('get_grid_columns', ctx, { targetGridId: 'no-such-grid' });

    expect(result.ok).toBe(false);
    expect(loadGridLevelData).not.toHaveBeenCalled();
  });

  it('add_calculated_column reads the current profile, merges the new column, and saves', async () => {
    const { ctx, list, save } = fakeCtx();
    const existing: ProfileSnapshot = {
      id: 'default', gridId: 'grid-test', name: 'Default',
      state: { 'calculated-columns': { v: 3, data: { virtualColumns: [{ colId: 'notional' }] } } },
      createdAt: 1, updatedAt: 1,
    };
    list.mockResolvedValue([existing]);

    const result = await dispatchTool(
      'add_calculated_column',
      ctx,
      { targetGridId: 'grid-test', colId: 'spread', headerName: 'Spread', expression: '[ask] - [bid]' },
    );

    expect(result.ok).toBe(true);
    expect(list).toHaveBeenCalledWith({ instanceId: 'grid-test' });
    expect(save).toHaveBeenCalledTimes(1);
    const [scope, snapshot] = save.mock.calls[0] as [{ instanceId: string }, ProfileSnapshot];
    expect(scope).toEqual({ instanceId: 'grid-test' });
    expect(snapshot.state['calculated-columns']).toEqual({
      v: 3,
      data: { virtualColumns: [{ colId: 'notional' }, { colId: 'spread', headerName: 'Spread', expression: '[ask] - [bid]', cellDataType: undefined, position: undefined }] },
    });
  });

  it('add_calculated_column rejects missing required fields without touching the store', async () => {
    const { ctx, save } = fakeCtx();

    const result = await dispatchTool('add_calculated_column', ctx, { targetGridId: 'grid-test', colId: 'x' });

    expect(result.ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('add_calculated_column rejects an unknown targetGridId', async () => {
    const { ctx, save } = fakeCtx();

    const result = await dispatchTool(
      'add_calculated_column',
      ctx,
      { targetGridId: 'ghost-grid', colId: 'x', headerName: 'X', expression: '[a]' },
    );

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('ghost-grid');
    expect(save).not.toHaveBeenCalled();
  });

  it('create_blotter registers the entry, seeds gridLevelData, and adds a dock button', async () => {
    const { ctx, saveGridLevelData } = fakeCtx();

    const result = await dispatchTool('create_blotter', ctx, { displayName: 'Credit Blotter', providerId: 'dp-1' });

    expect(result.ok).toBe(true);
    expect(mockAddRegistryEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'grid-credit-blotter',
        configId: 'grid-credit-blotter',
        componentType: 'grid',
        componentSubType: 'credit-blotter',
        hostUrl: '/#/blotters/marketsgrid',
        displayName: 'Credit Blotter',
        appId: 'Star-Demo',
        asWindow: true,
        // Template-backed: a singleton skips the template→instance clone, so
        // the window's config row IS the template. That is what makes every
        // later edit persist to the template, apply live to the open window,
        // and re-launch focus that window instead of spawning a second copy.
        singleton: true,
      }),
    );
    // The third arg (`identity`) is required: without it the row's
    // componentType is rewritten to the generic 'markets-grid-profile-set'
    // instead of matching the registered component. `singleton` has to agree
    // with the registry entry, or the row stops describing what it is.
    expect(saveGridLevelData).toHaveBeenCalledWith(
      { instanceId: 'grid-credit-blotter' },
      { v: 1, provider: { liveProviderId: 'dp-1', historicalProviderId: null, mode: 'live' }, caption: 'Credit Blotter' },
      { identity: { componentType: 'grid', componentSubType: 'credit-blotter', isTemplate: true, singleton: true } },
    );
    // Filed under the "Assets" menu, not as another top-level dock button —
    // a dock that grows a button per blotter stops being navigable.
    expect(mockAddDockButton).toHaveBeenCalledWith(
      expect.objectContaining({ registryEntryId: 'grid-credit-blotter', tooltip: 'Credit Blotter', group: 'Assets' }),
    );
  });

  it('create_blotter files under a caller-named menu when one is given', async () => {
    const { ctx } = fakeCtx();

    await dispatchTool('create_blotter', ctx, { displayName: 'Muni', dockGroup: 'Fixed Income' });

    expect(mockAddDockButton).toHaveBeenCalledWith(expect.objectContaining({ group: 'Fixed Income' }));
  });

  it('create_blotter gives it a top-level dock button when dockGroup is blank', async () => {
    const { ctx } = fakeCtx();

    await dispatchTool('create_blotter', ctx, { displayName: 'Muni', dockGroup: '' });

    const opts = mockAddDockButton.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(opts).toMatchObject({ registryEntryId: 'grid-muni' });
    expect(opts.group).toBeUndefined();
  });

  it('create_blotter skips the dock button when addToDock is false', async () => {
    const { ctx } = fakeCtx();

    await dispatchTool('create_blotter', ctx, { displayName: 'Rates', addToDock: false });

    expect(mockAddRegistryEntry).toHaveBeenCalled();
    expect(mockAddDockButton).not.toHaveBeenCalled();
  });

  it('create_blotter refuses a duplicate id instead of clobbering the existing blotter', async () => {
    const { ctx } = fakeCtx();
    mockRegistryEntryExists.mockResolvedValue(true);

    const result = await dispatchTool('create_blotter', ctx, { displayName: 'Credit Blotter' });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('already exists');
    expect(mockAddRegistryEntry).not.toHaveBeenCalled();
    expect(mockAddDockButton).not.toHaveBeenCalled();
  });

  /**
   * The provider BINDING is read once when the container mounts, so it is one
   * of the few changes that cannot be re-applied live. It must reload the
   * window the user already has rather than tell them to reopen it — reopening
   * a singleton only focuses, so the stale feed would survive the trip.
   */
  it('set_grid_provider reloads the open window instead of telling the user to reopen', async () => {
    const { ctx } = fakeCtx();

    const result = await dispatchTool('set_grid_provider', ctx, {
      targetGridId: 'grid-test',
      providerId: 'dp-9',
    });

    expect(result.ok).toBe(true);
    expect(result.summary).not.toMatch(/reopen/i);
    // Nothing is open in the unit environment, and the summary says exactly
    // that rather than claiming a refresh that never happened.
    expect(result.summary).toContain('Nothing is open to reload');
  });

  /** A module write lands in the row the open grid reads, so it needs no reload. */
  it('update_module_settings does not tell the user to reopen', async () => {
    const { ctx } = fakeCtx();

    const result = await dispatchTool('update_module_settings', ctx, {
      targetGridId: 'grid-test',
      moduleId: 'general-settings',
      settings: { enableCellChangeFlash: true },
    });

    expect(result.ok).toBe(true);
    expect(result.summary).not.toMatch(/reopen/i);
  });

  it('update_module_settings merges one key without disturbing the rest', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([
      {
        id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
        state: { 'general-settings': { v: 6, data: { rowHeight: 30, gridDensity: 'compact', enableCellChangeFlash: false } } },
      },
    ]);

    const result = await dispatchTool('update_module_settings', ctx, {
      targetGridId: 'grid-test',
      moduleId: 'general-settings',
      settings: { enableCellChangeFlash: true },
    });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    expect(snapshot.state['general-settings']).toEqual({
      v: 6,
      data: { rowHeight: 30, gridDensity: 'compact', enableCellChangeFlash: true },
    });
  });

  it('update_module_settings rejects an unknown module rather than writing junk', async () => {
    const { ctx, save } = fakeCtx();

    const result = await dispatchTool('update_module_settings', ctx, {
      targetGridId: 'grid-test',
      moduleId: 'not-a-module',
      settings: { foo: 1 },
    });

    expect(result.ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  /**
   * The capability the assistant previously lacked: a rule whose arrows appear
   * on a tick and clear themselves. Asserts the rich fields land as TOP-LEVEL
   * rule properties — nesting them under `style` is the failure this guards.
   */
  it('add_conditional_styling_rule persists indicator + activeDurationMs alongside style', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([]);

    const result = await dispatchTool('add_conditional_styling_rule', ctx, {
      targetGridId: 'grid-test',
      name: 'Market value ticked up',
      scope: { type: 'cell', columns: ['marketValue'] },
      expression: '[marketValue.new] > [marketValue.old]',
      style: { light: { color: '#1f7a34' }, dark: { color: '#7fdf9b' } },
      indicator: { icon: 'arrow-up', position: 'top-left', target: 'cells', color: '#7fdf9b' },
      flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'emerald', durationMs: 500 },
      activeDurationMs: 700,
    });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const rules = (snapshot.state['conditional-styling'].data as { rules: Array<Record<string, unknown>> }).rules;
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      expression: '[marketValue.new] > [marketValue.old]',
      indicator: { icon: 'arrow-up', position: 'top-left', target: 'cells', color: '#7fdf9b' },
      flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'emerald', durationMs: 500 },
      activeDurationMs: 700,
    });
    expect(rules[0].style).toEqual({ light: { color: '#1f7a34' }, dark: { color: '#7fdf9b' } });
  });

  it('add_conditional_styling_rule rejects an unknown indicator icon without writing', async () => {
    const { ctx, save } = fakeCtx();

    const result = await dispatchTool('add_conditional_styling_rule', ctx, {
      targetGridId: 'grid-test',
      name: 'bad icon',
      scope: { type: 'cell', columns: ['marketValue'] },
      expression: 'value > 0',
      style: { light: {}, dark: {} },
      indicator: { icon: 'arrow-upwards' },
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('arrow-up');
    expect(save).not.toHaveBeenCalled();
  });

  it('update_conditional_styling_rule patches one feature and leaves the rest of the rule intact', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([
      {
        id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
        state: {
          'conditional-styling': {
            v: 1,
            data: {
              rules: [
                {
                  id: 'r1', name: 'Tick up', enabled: true, priority: 6,
                  scope: { type: 'cell', columns: ['marketValue'] },
                  expression: '[marketValue.new] > [marketValue.old]',
                  style: { light: { color: '#1f7a34' }, dark: { color: '#7fdf9b' } },
                  activeDurationMs: 1500,
                },
              ],
            },
          },
        },
      },
    ]);

    const result = await dispatchTool('update_conditional_styling_rule', ctx, {
      targetGridId: 'grid-test',
      ruleId: 'r1',
      activeDurationMs: 700,
    });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const [rule] = (snapshot.state['conditional-styling'].data as { rules: Array<Record<string, unknown>> }).rules;
    expect(rule.activeDurationMs).toBe(700);
    expect(rule.expression).toBe('[marketValue.new] > [marketValue.old]');
    expect(rule.name).toBe('Tick up');
  });

  it('update_conditional_styling_rule rejects a row-only flash target on a cell rule without writing', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([
      {
        id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
        state: {
          'conditional-styling': {
            v: 1,
            data: { rules: [{ id: 'r1', name: 'x', enabled: true, priority: 1, scope: { type: 'cell', columns: ['a'] }, expression: 'value > 0', style: {} }] },
          },
        },
      },
    ]);

    const result = await dispatchTool('update_conditional_styling_rule', ctx, {
      targetGridId: 'grid-test',
      ruleId: 'r1',
      flash: { enabled: true, target: 'row' },
    });

    expect(result.ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('get_feature_guide returns the conditional-styling recipe, and names valid ids when asked for a bad one', async () => {
    const { ctx } = fakeCtx();

    const guide = await dispatchTool('get_feature_guide', ctx, { featureId: 'conditional-styling' });
    expect(guide.ok).toBe(true);
    const detail = (guide.data as { detail: string }).detail;
    expect(detail).toContain('activeDurationMs');
    expect(detail).toContain('[marketValue.new] > [marketValue.old]');

    const missing = await dispatchTool('get_feature_guide', ctx, { featureId: 'nope' });
    expect(missing.ok).toBe(false);
    expect(missing.summary).toContain('conditional-styling');
  });

  /**
   * Split into columnImportGuides.ts to keep featureGuides.ts under the
   * 800-line ceiling — this proves the split still wires into the same
   * FEATURE_GUIDES list the tool reads from.
   */
  it('get_feature_guide serves the expression-dsl and column-def-import guides', async () => {
    const { ctx } = fakeCtx();

    const dsl = await dispatchTool('get_feature_guide', ctx, { featureId: 'expression-dsl' });
    expect(dsl.ok).toBe(true);
    const dslDetail = (dsl.data as { detail: string }).detail;
    expect(dslDetail).toContain('ISNULL');
    // The bug this task fixed: LOG10 doesn't exist, only LOG.
    expect(dslDetail).not.toContain('LOG10(');

    const importGuide = await dispatchTool('get_feature_guide', ctx, { featureId: 'column-def-import' });
    expect(importGuide.ok).toBe(true);
    const importDetail = (importGuide.data as { detail: string }).detail;
    expect(importDetail).toContain('cellDataType');
    expect(importDetail).toContain('list_cell_renderers');
  });

  it('get_module_settings reports defaults-in-use when the module has no saved state', async () => {
    const { ctx, list } = fakeCtx();
    list.mockResolvedValue([{ id: '__default__', gridId: 'grid-test', name: 'Default', state: {}, createdAt: 1, updatedAt: 1 }]);

    const result = await dispatchTool('get_module_settings', ctx, { targetGridId: 'grid-test', moduleId: 'general-settings' });

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('platform defaults');
  });

  it('set_grid_provider rebinds an existing grid without clobbering its caption', async () => {
    const { ctx, loadGridLevelData, saveGridLevelData } = fakeCtx();
    loadGridLevelData.mockResolvedValue({
      v: 1,
      provider: { liveProviderId: 'old-dp', historicalProviderId: null, mode: 'live' },
      caption: 'My Blotter',
    });

    const result = await dispatchTool('set_grid_provider', ctx, { targetGridId: 'grid-test', providerId: 'dp-new' });

    expect(result.ok).toBe(true);
    expect(saveGridLevelData).toHaveBeenCalledWith(
      { instanceId: 'grid-test' },
      expect.objectContaining({
        provider: { liveProviderId: 'dp-new', historicalProviderId: null, mode: 'live' },
        caption: 'My Blotter',
      }),
      expect.objectContaining({ identity: expect.objectContaining({ componentType: 'grid' }) }),
    );
  });

  it('set_grid_provider binding a historical feed leaves the live one intact', async () => {
    const { ctx, loadGridLevelData, saveGridLevelData } = fakeCtx();
    loadGridLevelData.mockResolvedValue({
      v: 1,
      provider: { liveProviderId: 'live-dp', historicalProviderId: null, mode: 'live' },
    });

    await dispatchTool('set_grid_provider', ctx, { targetGridId: 'grid-test', providerId: 'hist-dp', mode: 'historical' });

    const [, data] = saveGridLevelData.mock.calls[0] as [unknown, { provider: Record<string, unknown> }];
    expect(data.provider).toEqual({ liveProviderId: 'live-dp', historicalProviderId: 'hist-dp', mode: 'historical' });
  });

  it('create_data_provider merges defaults, validates, then saves through the store', async () => {
    const { ctx, storeSave } = fakeCtx();
    storeSave.mockResolvedValue({ name: 'Mock Positions', providerId: 'p2' });

    const result = await dispatchTool(
      'create_data_provider',
      ctx,
      { name: 'Mock Positions', providerType: 'mock', config: { dataType: 'positions' } },
    );

    expect(result.ok).toBe(true);
    expect(storeSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Mock Positions',
        userId: 'dev1',
        config: expect.objectContaining({ providerType: 'mock', dataType: 'positions', updateInterval: 2000 }),
      }),
      'dev1',
    );
  });

  it('create_data_provider returns validation errors and never saves an invalid config', async () => {
    const { ctx, storeSave } = fakeCtx();

    const result = await dispatchTool(
      'create_data_provider',
      ctx,
      { name: 'Bad', providerType: 'rest', config: {} },
    );

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('unsupported providerType');
    expect(storeSave).not.toHaveBeenCalled();
  });

  /**
   * A provider's columns are read when a grid's container mounts, so an
   * already-open blotter never picks up a config change on its own —
   * set_provider_columns already reloads for this reason; update_data_provider
   * used to skip it, so columnDefinitions written through raw JSON here saved
   * fine but never appeared on a window already showing the feed.
   */
  it('update_data_provider reloads bound blotters when the config actually changes', async () => {
    const { ctx, storeGet, storeSave, loadGridLevelData } = fakeCtx();
    storeGet.mockResolvedValue({
      providerId: 'p1', name: 'Positions', providerType: 'mock',
      config: { providerType: 'mock', dataType: 'positions', columnDefinitions: [] },
    });
    storeSave.mockResolvedValue({
      providerId: 'p1', name: 'Positions', providerType: 'mock',
      config: { providerType: 'mock', dataType: 'positions', columnDefinitions: [{ field: 'cusip', headerName: 'CUSIP' }] },
    });
    loadGridLevelData.mockResolvedValue({ provider: { liveProviderId: 'p1' } });

    const result = await dispatchTool('update_data_provider', ctx, {
      providerId: 'p1',
      config: { columnDefinitions: [{ field: 'cusip', headerName: 'CUSIP' }] },
    });

    expect(result.ok).toBe(true);
    // Proves the bound-blotter walk actually ran, not just that save succeeded.
    expect(loadGridLevelData).toHaveBeenCalled();
    expect(result.summary).toMatch(/reload|open to reload/i);
  });

  it('update_data_provider does not walk bound blotters for a cosmetic rename', async () => {
    const { ctx, storeGet, storeSave, loadGridLevelData } = fakeCtx();
    storeGet.mockResolvedValue({
      providerId: 'p1', name: 'Positions', providerType: 'mock',
      config: { providerType: 'mock', dataType: 'positions' },
    });
    storeSave.mockResolvedValue({ providerId: 'p1', name: 'Live Positions', providerType: 'mock', config: { providerType: 'mock', dataType: 'positions' } });

    const result = await dispatchTool('update_data_provider', ctx, { providerId: 'p1', name: 'Live Positions' });

    expect(result.ok).toBe(true);
    expect(loadGridLevelData).not.toHaveBeenCalled();
    expect(result.summary).not.toContain('reload');
  });

  /**
   * A dock launch clones the template into a per-window row and the view then
   * reads only its own row (see launch.ts). Writing the template alone is why
   * an already-open blotter never changed — every mutation has to fan out.
   */
  describe('template / instance fan-out', () => {
    const INSTANCE_ROWS = [
      { configId: 'dev1grid-test-1700000000000', componentType: 'grid', componentSubType: 'test', isTemplate: false, updatedTime: '2026-08-01T00:00:00.000Z' },
      { configId: 'dev1grid-test-1800000000000', componentType: 'grid', componentSubType: 'test', isTemplate: false, updatedTime: '2026-08-02T00:00:00.000Z' },
      { configId: 'grid-test', componentType: 'grid', componentSubType: 'test', isTemplate: true, updatedTime: '2026-08-03T00:00:00.000Z' },
    ];

    it('writes the rule to the template, leaving open instances alone', async () => {
      const { ctx, list, save, findByComponentType } = fakeCtx();
      findByComponentType.mockResolvedValue(INSTANCE_ROWS);
      list.mockResolvedValue([]);

      const result = await dispatchTool('add_conditional_styling_rule', ctx, {
        targetGridId: 'grid-test',
        name: 'Losers',
        scope: { type: 'cell', columns: ['dailyPnl'] },
        expression: 'value < 0',
        style: { light: { color: '#a02a2a' }, dark: { color: '#ee8e8e' } },
      });

      expect(result.ok).toBe(true);
      const written = save.mock.calls.map(([scope]) => (scope as { instanceId: string }).instanceId);
      // The component's definition is the template. Discovery still returns
      // the two instance rows; they are deliberately not written.
      expect(written).toEqual(['grid-test']);
      expect(result.summary).not.toContain('instance(s)');
    });

    /**
     * A wand-scoped panel's `focusInstanceId` is the window it was opened
     * from — dispatchTool defaults an unpinned call's pin to it, so the call
     * lands on THAT window alone: never the template, never a sibling. This is
     * the fix for "the chatbot doesn't know which instance it's working on and
     * applies changes to every instance of the grid id" — it used to also
     * write `grid-test` (the template) here.
     */
    it('pins an unpinned call to the focused window alone, never the template', async () => {
      const { ctx, list, save, findByComponentType } = fakeCtx();
      const scoped = { ...ctx, focusInstanceId: 'dev1grid-test-1700000000000' };
      findByComponentType.mockResolvedValue(INSTANCE_ROWS.slice(0, 1));
      list.mockImplementation(async ({ instanceId }: { instanceId: string }) => [
        {
          id: '__default__', gridId: instanceId, name: 'Default', createdAt: 1, updatedAt: 1,
          state: {
            'conditional-styling': {
              v: 1,
              // The window already carries a rule the template never had.
              data: { rules: [{ id: 'user-made', name: 'Mine' }] },
            },
          },
        },
      ]);

      await dispatchTool('add_conditional_styling_rule', scoped, {
        targetGridId: 'grid-test',
        name: 'Losers',
        scope: { type: 'cell', columns: ['dailyPnl'] },
        expression: 'value < 0',
        style: { light: {}, dark: {} },
      });

      const written = save.mock.calls.map(([scope]) => (scope as { instanceId: string }).instanceId);
      expect(written).toEqual(['dev1grid-test-1700000000000']);
      const [, snapshot] = save.mock.calls[0];
      const rules = (snapshot as ProfileSnapshot).state['conditional-styling'].data as { rules: Array<{ id: string; name: string }> };
      // The window keeps its own rule and gains the new one.
      expect(rules.rules.map((r) => r.name)).toEqual(['Mine', 'Losers']);
    });

    /**
     * A call can still override the default pin by naming a different window
     * of the SAME blotter explicitly — "also do this on the other window" —
     * proving the fix didn't turn the default into a hard lock.
     */
    it('lets an explicit instanceId override the focused window', async () => {
      const { ctx, list, save, findByComponentType, getConfig } = fakeCtx();
      const scoped = { ...ctx, focusInstanceId: 'dev1grid-test-1700000000000' };
      findByComponentType.mockResolvedValue(INSTANCE_ROWS.slice(0, 1));
      list.mockResolvedValue([{ id: '__default__', gridId: 'x', name: 'Default', createdAt: 1, updatedAt: 1, state: {} }]);
      // resolveInstancePin has to be able to verify the named instance
      // belongs to "grid-test" before it can override the focused window.
      getConfig.mockResolvedValue({ componentType: 'grid', componentSubType: 'test' });

      await dispatchTool('add_conditional_styling_rule', scoped, {
        targetGridId: 'grid-test',
        instanceId: 'dev1grid-test-1800000000000',
        name: 'Losers',
        scope: { type: 'cell', columns: ['dailyPnl'] },
        expression: 'value < 0',
        style: { light: {}, dark: {} },
      });

      const written = save.mock.calls.map(([scope]) => (scope as { instanceId: string }).instanceId);
      expect(written).toEqual(['dev1grid-test-1800000000000']);
    });

    it('still writes the template when instances cannot be enumerated', async () => {
      const { ctx, list, save, findByComponentType } = fakeCtx();
      findByComponentType.mockRejectedValue(new Error('config db unavailable'));
      list.mockResolvedValue([]);

      const result = await dispatchTool('update_module_settings', ctx, {
        targetGridId: 'grid-test',
        moduleId: 'general-settings',
        settings: { rowHeight: 24 },
      });

      expect(result.ok).toBe(true);
      expect(save).toHaveBeenCalledTimes(1);
      expect((save.mock.calls[0][0] as { instanceId: string }).instanceId).toBe('grid-test');
    });

    it('list_grid_instances reports the windows a blotter currently has', async () => {
      const { ctx, findByComponentType } = fakeCtx();
      findByComponentType.mockResolvedValue(INSTANCE_ROWS);

      const result = await dispatchTool('list_grid_instances', ctx, { targetGridId: 'grid-test' });

      expect(result.ok).toBe(true);
      expect(result.data).toMatchObject({ templateConfigId: 'grid-test', singleton: true });
      expect((result.data as { instances: unknown[] }).instances).toHaveLength(2);
    });
  });

  /**
   * Field blindness is what makes a model invent a column name, producing a
   * rule that saves cleanly and never matches. These cover the two paths that
   * exist before a grid has any provider bound.
   */
  describe('describe_data_fields', () => {
    it('answers from a mock dataType with no provider in existence', async () => {
      const { ctx, storeGet } = fakeCtx();

      const result = await dispatchTool('describe_data_fields', ctx, { dataType: 'positions' });

      expect(result.ok).toBe(true);
      const fields = (result.data as Array<{ field: string }>).map((f) => f.field);
      // The ticking layer and the static universe both have to be visible.
      expect(fields).toContain('marketValue');
      expect(fields).toContain('cusip');
      expect(storeGet).not.toHaveBeenCalled();
    });

    it('prefers a provider\'s saved columnDefinitions when it has them', async () => {
      const { ctx, storeGet } = fakeCtx();
      storeGet.mockResolvedValue({
        providerId: 'p1', name: 'Desk feed', providerType: 'stomp',
        config: { providerType: 'stomp', columnDefinitions: [{ field: 'spreadBps', headerName: 'Spread' }] },
      });

      const result = await dispatchTool('describe_data_fields', ctx, { providerId: 'p1' });

      expect(result.ok).toBe(true);
      expect(result.summary).toContain('spreadBps');
    });

    it('says a STOMP feed needs a probe rather than pretending it has no fields', async () => {
      const { ctx, storeGet } = fakeCtx();
      storeGet.mockResolvedValue({
        providerId: 'p2', name: 'Unprobed', providerType: 'stomp', config: { providerType: 'stomp' },
      });

      const result = await dispatchTool('describe_data_fields', ctx, { providerId: 'p2' });

      expect(result.ok).toBe(false);
      expect(result.summary).toContain('Probe');
    });

    it('falls back to probing a mock provider that never saved its columns', async () => {
      const { ctx, storeGet } = fakeCtx();
      storeGet.mockResolvedValue({
        providerId: 'p3', name: 'Bare mock', providerType: 'mock',
        config: { providerType: 'mock', dataType: 'positions' },
      });

      const result = await dispatchTool('describe_data_fields', ctx, { providerId: 'p3' });

      expect(result.ok).toBe(true);
      expect(result.summary).toContain('cusip');
    });
  });

  it('add_module_item appends a saved-filter pill and generates an id when none is given', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([]);

    const result = await dispatchTool('add_module_item', ctx, {
      targetGridId: 'grid-test',
      moduleId: 'saved-filters',
      item: { label: 'P&L losers', active: false, filterModel: { dailyPnL: { filterType: 'number', type: 'lessThan', filter: 0 } } },
    });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const filters = (snapshot.state['saved-filters'].data as { filters: Array<Record<string, unknown>> }).filters;
    expect(filters).toHaveLength(1);
    expect(filters[0].label).toBe('P&L losers');
    expect(typeof filters[0].id).toBe('string');
  });

  it('update_module_item patches one item by id and refuses to move its id', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([
      {
        id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
        state: {
          'saved-filters': {
            v: 1,
            data: { filters: [{ id: 'qf-a', label: 'A', active: true }, { id: 'qf-b', label: 'B', active: false }] },
          },
        },
      },
    ]);

    const result = await dispatchTool('update_module_item', ctx, {
      targetGridId: 'grid-test',
      moduleId: 'saved-filters',
      itemId: 'qf-b',
      patch: { label: 'B renamed', id: 'hijacked' },
    });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const filters = (snapshot.state['saved-filters'].data as { filters: Array<Record<string, unknown>> }).filters;
    expect(filters[0]).toEqual({ id: 'qf-a', label: 'A', active: true });
    expect(filters[1]).toEqual({ id: 'qf-b', label: 'B renamed', active: false });
  });

  it('remove_module_item drops one item and reports an unknown id instead of writing', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([
      {
        id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
        state: { 'column-groups': { v: 1, data: { groups: [{ groupId: 'g1' }, { groupId: 'g2' }] } } },
      },
    ]);

    const removed = await dispatchTool('remove_module_item', ctx, { targetGridId: 'grid-test', moduleId: 'column-groups', itemId: 'g1' });
    expect(removed.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    expect((snapshot.state['column-groups'].data as { groups: Array<{ groupId: string }> }).groups).toEqual([{ groupId: 'g2' }]);

    save.mockClear();
    const missing = await dispatchTool('remove_module_item', ctx, { targetGridId: 'grid-test', moduleId: 'column-groups', itemId: 'nope' });
    expect(missing.ok).toBe(false);
    expect(missing.summary).toContain('list_module_items');
  });

  it('module-item tools refuse the runtime-owned alert history', async () => {
    const { ctx, save } = fakeCtx();

    const result = await dispatchTool('add_module_item', ctx, {
      targetGridId: 'grid-test',
      moduleId: 'alerts',
      collection: 'history',
      item: { message: 'fake' },
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('runtime');
    expect(save).not.toHaveBeenCalled();
  });

  it('list_module_items reports items with the field that identifies them', async () => {
    const { ctx, list } = fakeCtx();
    list.mockResolvedValue([
      {
        id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
        state: { 'calculated-columns': { v: 1, data: { virtualColumns: [{ colId: 'calc_a', expression: '[x] * 2' }] } } },
      },
    ]);

    const result = await dispatchTool('list_module_items', ctx, { targetGridId: 'grid-test', moduleId: 'calculated-columns' });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      moduleId: 'calculated-columns',
      collection: 'virtualColumns',
      idField: 'colId',
      items: [{ colId: 'calc_a', expression: '[x] * 2' }],
    });
  });

  /** Destructive, so the gate is enforced here rather than only asked for in
   *  the prompt — a model that skips the question must not delete anything. */
  it('delete_data_provider refuses without confirmation, naming what would go', async () => {
    const { ctx, storeGet, loadGridLevelData } = fakeCtx();
    storeGet.mockResolvedValue({ providerId: 'p1', name: 'Mock positions', providerType: 'mock', config: {} });
    loadGridLevelData.mockResolvedValue({ provider: { liveProviderId: 'p1', historicalProviderId: null } });
    const remove = vi.fn().mockResolvedValue(undefined);
    (ctx.configStore as unknown as { remove: unknown }).remove = remove;

    const result = await dispatchTool('delete_data_provider', ctx, { providerId: 'p1' });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('confirm: true');
    expect(result.summary).toContain('TestGrid');
    expect(remove).not.toHaveBeenCalled();
  });

  it('delete_data_provider removes the config once confirmed, warning about bound grids', async () => {
    const { ctx, storeGet, loadGridLevelData } = fakeCtx();
    storeGet.mockResolvedValue({ providerId: 'p1', name: 'Mock positions', providerType: 'mock', config: {} });
    loadGridLevelData.mockResolvedValue({ provider: { liveProviderId: 'p1', historicalProviderId: null } });
    const remove = vi.fn().mockResolvedValue(undefined);
    (ctx.configStore as unknown as { remove: unknown }).remove = remove;

    const result = await dispatchTool('delete_data_provider', ctx, { providerId: 'p1', confirm: true });

    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith('p1');
    expect(result.summary).toContain('TestGrid');
  });
});
