import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  addRegistryEntry,
  addDockButton,
  registryEntryExists,
  buildRegistryEntry,
  removeDockButtons,
  renameDockButtons,
  BLOTTER_DOCK_GROUP,
} from './registryOps';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';

const mockLoadRegistryConfig = vi.fn();
const mockSaveRegistryConfig = vi.fn();
const mockLoadDockConfig = vi.fn();
const mockSaveDockConfig = vi.fn();

vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
  saveRegistryConfig: (...args: unknown[]) => mockSaveRegistryConfig(...args),
  loadDockConfig: (...args: unknown[]) => mockLoadDockConfig(...args),
  saveDockConfig: (...args: unknown[]) => mockSaveDockConfig(...args),
  ACTION_LAUNCH_COMPONENT: 'launch-component',
  IAB_DOCK_CONFIG_UPDATE: 'dock-config-update',
  IAB_REGISTRY_CONFIG_UPDATE: 'registry-config-update',
  REGISTRY_CONFIG_VERSION: 2,
}));

const mockPublish = vi.fn();

const ENTRY: RegistryEntry = buildRegistryEntry({
  id: 'grid-credit', hostUrl: '/#/blotters/marketsgrid', displayName: 'Credit',
  componentType: 'grid', componentSubType: 'credit', configId: 'grid-credit', appId: 'Star-Demo',
});

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue(null);
  mockSaveRegistryConfig.mockReset().mockResolvedValue(undefined);
  mockLoadDockConfig.mockReset().mockResolvedValue(null);
  mockSaveDockConfig.mockReset().mockResolvedValue(undefined);
  mockPublish.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fin', { InterApplicationBus: { publish: mockPublish } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildRegistryEntry', () => {
  it('defaults to a non-singleton window-hosted internal component', () => {
    expect(ENTRY).toMatchObject({ type: 'internal', usesHostConfig: true, singleton: false, asWindow: true });
  });
});

describe('registryEntryExists', () => {
  it('is false against an empty registry and true once the id is present', async () => {
    await expect(registryEntryExists('grid-credit')).resolves.toBe(false);
    mockLoadRegistryConfig.mockResolvedValue({ version: 2, entries: [ENTRY] });
    await expect(registryEntryExists('grid-credit')).resolves.toBe(true);
  });
});

describe('addRegistryEntry', () => {
  it('appends to existing entries rather than replacing them', async () => {
    const existing = { ...ENTRY, id: 'grid-test' };
    mockLoadRegistryConfig.mockResolvedValue({ version: 2, entries: [existing] });

    await addRegistryEntry(ENTRY);

    const saved = mockSaveRegistryConfig.mock.calls[0][0] as { entries: Array<{ id: string }> };
    expect(saved.entries.map((e) => e.id)).toEqual(['grid-test', 'grid-credit']);
  });

  it('publishes the registry so open editor windows refresh', async () => {
    await addRegistryEntry(ENTRY);

    const saved = mockSaveRegistryConfig.mock.calls[0][0];
    expect(mockPublish).toHaveBeenCalledWith('registry-config-update', saved);
  });

  it('is a no-op when the id already exists', async () => {
    mockLoadRegistryConfig.mockResolvedValue({ version: 2, entries: [ENTRY] });

    await addRegistryEntry(ENTRY);

    expect(mockSaveRegistryConfig).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

describe('addDockButton', () => {
  it('REFUSES to write when no dock config exists — creating one would replace the platform default dock', async () => {
    mockLoadDockConfig.mockResolvedValue(null);

    await expect(addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit' })).resolves.toBe(false);

    expect(mockSaveDockConfig).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('creates the first dock config only when explicitly allowed', async () => {
    mockLoadDockConfig.mockResolvedValue(null);

    await expect(
      addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit', allowCreate: true }),
    ).resolves.toBe(true);

    expect(mockSaveDockConfig).toHaveBeenCalled();
  });

  it('adds a launch-component button carrying the registry entry id', async () => {
    mockLoadDockConfig.mockResolvedValue({ version: 1, buttons: [] });
    await addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit', asWindow: true });

    const saved = mockSaveDockConfig.mock.calls[0][0] as { buttons: Array<Record<string, unknown>> };
    expect(saved.buttons[0]).toMatchObject({
      type: 'ActionButton',
      actionId: 'launch-component',
      tooltip: 'Credit',
      customData: { registryEntryId: 'grid-credit', asWindow: true },
    });
  });

  it('preserves existing buttons and appends the new one', async () => {
    mockLoadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [{ type: 'ActionButton', id: 'other', tooltip: 'Other', iconUrl: '', actionId: 'x' }],
    });

    await addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit' });

    const saved = mockSaveDockConfig.mock.calls[0][0] as { buttons: Array<{ id: string; tooltip: string }> };
    expect(saved.buttons).toHaveLength(2);
    expect(saved.buttons[0].id).toBe('other');
    expect(saved.buttons[1].tooltip).toBe('Credit');
  });

  it('publishes the new config so the RUNNING dock rebuilds (saving alone needs a restart)', async () => {
    mockLoadDockConfig.mockResolvedValue({ version: 1, buttons: [] });
    await addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit' });

    const savedConfig = mockSaveDockConfig.mock.calls[0][0];
    expect(mockPublish).toHaveBeenCalledWith('dock-config-update', savedConfig);
  });

  it('still persists when publishing throws (dock catches up on restart)', async () => {
    mockLoadDockConfig.mockResolvedValue({ version: 1, buttons: [] });
    mockPublish.mockRejectedValue(new Error('no IAB'));

    await expect(addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit' })).resolves.toBe(true);

    expect(mockSaveDockConfig).toHaveBeenCalled();
  });

  it('is a no-op when a button already targets that entry', async () => {
    mockLoadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [{ type: 'ActionButton', id: 'anything', tooltip: 'Credit', iconUrl: '', actionId: 'launch-component', customData: { registryEntryId: 'grid-credit' } }],
    });

    await addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit' });

    expect(mockSaveDockConfig).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  /**
   * Two near-simultaneous self-heal calls (e.g. two windows booting at once)
   * can each read the dock before either's write lands, each conclude "not
   * present yet", and each append their own button — since a placement's `id`
   * is a fresh UUID per call, `dockTargets`'s existence check doesn't catch
   * that at add-time. This is the case actually reported: two identical
   * AI Assistant buttons sitting side by side on the dock. Every future call
   * collapses that back down to one rather than leaving it duplicated forever.
   */
  it('collapses pre-existing duplicates down to one instead of leaving them', async () => {
    mockLoadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [
        { type: 'ActionButton', id: 'first', tooltip: 'AI Assistant', iconUrl: '', actionId: 'launch-component', customData: { registryEntryId: 'ai-assistant' } },
        { type: 'ActionButton', id: 'other', tooltip: 'Credit', iconUrl: '', actionId: 'launch-component', customData: { registryEntryId: 'grid-credit' } },
        { type: 'ActionButton', id: 'second', tooltip: 'AI Assistant', iconUrl: '', actionId: 'launch-component', customData: { registryEntryId: 'ai-assistant' } },
      ],
    });

    await expect(addDockButton({ registryEntryId: 'ai-assistant', tooltip: 'AI Assistant' })).resolves.toBe(true);

    const saved = mockSaveDockConfig.mock.calls[0][0] as { buttons: Array<{ id: string; customData?: { registryEntryId?: string } } > };
    const aiAssistantButtons = saved.buttons.filter((b) => b.customData?.registryEntryId === 'ai-assistant');
    expect(aiAssistantButtons).toHaveLength(1);
    expect(aiAssistantButtons[0].id).toBe('first');
    // The unrelated button is untouched.
    expect(saved.buttons.some((b) => b.id === 'other')).toBe(true);
    expect(mockPublish).toHaveBeenCalledWith('dock-config-update', saved);
  });

  it('leaves a single existing target alone — no spurious save', async () => {
    mockLoadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [{ type: 'ActionButton', id: 'only', tooltip: 'AI Assistant', iconUrl: '', actionId: 'launch-component', customData: { registryEntryId: 'ai-assistant' } }],
    });

    await addDockButton({ registryEntryId: 'ai-assistant', tooltip: 'AI Assistant' });

    expect(mockSaveDockConfig).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

/**
 * Blotters are filed under a dock dropdown rather than each taking a top-level
 * slot. That makes the menu — not just the dock bar — part of every dock
 * operation: an entry already in a menu must not also gain a button, and
 * delete/rename have to reach into menus or they leave dead items behind.
 */
describe('addDockButton — grouped under a dropdown', () => {
  const launchItem = (registryEntryId: string, tooltip: string, id = 'item-1') => ({
    id,
    tooltip,
    iconId: '',
    actionId: 'launch-component',
    customData: { registryEntryId, asWindow: true },
  });

  it('files the entry under an existing dropdown instead of adding a top-level button', async () => {
    mockLoadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [
        { type: 'ActionButton', id: 'other', tooltip: 'Other', iconUrl: '', actionId: 'x' },
        { type: 'DropdownButton', id: 'dd-assets', tooltip: 'Assets', iconUrl: '', options: [launchItem('grid-rates', 'Rates')] },
      ],
    });

    await expect(
      addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit', group: 'Assets', asWindow: true }),
    ).resolves.toBe(true);

    const saved = mockSaveDockConfig.mock.calls[0][0] as { buttons: Array<Record<string, any>> };
    // No new top-level button — the dock bar keeps exactly what it had.
    expect(saved.buttons).toHaveLength(2);
    const assets = saved.buttons.find((b) => b.tooltip === 'Assets')!;
    expect(assets.options).toHaveLength(2);
    expect(assets.options[1]).toMatchObject({
      tooltip: 'Credit',
      actionId: 'launch-component',
      customData: { registryEntryId: 'grid-credit', asWindow: true },
    });
  });

  it('matches the dropdown by label the way a user reads it, not byte-for-byte', async () => {
    mockLoadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [{ type: 'DropdownButton', id: 'dd', tooltip: ' assets ', iconUrl: '', options: [] }],
    });

    await addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit', group: 'Assets' });

    const saved = mockSaveDockConfig.mock.calls[0][0] as { buttons: Array<Record<string, any>> };
    expect(saved.buttons).toHaveLength(1);
    expect(saved.buttons[0].options).toHaveLength(1);
  });

  it('creates the dropdown when the dock has no menu by that name', async () => {
    mockLoadDockConfig.mockResolvedValue({ version: 1, buttons: [] });

    await addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit', group: BLOTTER_DOCK_GROUP });

    const saved = mockSaveDockConfig.mock.calls[0][0] as { buttons: Array<Record<string, any>> };
    expect(saved.buttons[0]).toMatchObject({ type: 'DropdownButton', tooltip: 'Assets' });
    expect(saved.buttons[0].options[0]).toMatchObject({ customData: { registryEntryId: 'grid-credit' } });
  });

  it('is a no-op when the entry is already an item in a menu', async () => {
    mockLoadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [{ type: 'DropdownButton', id: 'dd', tooltip: 'Assets', iconUrl: '', options: [launchItem('grid-credit', 'Credit')] }],
    });

    await expect(
      addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit', group: 'Assets' }),
    ).resolves.toBe(true);

    expect(mockSaveDockConfig).not.toHaveBeenCalled();
  });

  /** Otherwise an entry filed in a menu would also sprout a top-level button. */
  it('does not add a top-level button for an entry already in a menu', async () => {
    mockLoadDockConfig.mockResolvedValue({
      version: 1,
      buttons: [{ type: 'DropdownButton', id: 'dd', tooltip: 'Assets', iconUrl: '', options: [launchItem('grid-credit', 'Credit')] }],
    });

    await addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit' });

    expect(mockSaveDockConfig).not.toHaveBeenCalled();
  });

  it('still refuses to create the very first dock config, group or not', async () => {
    mockLoadDockConfig.mockResolvedValue(null);

    await expect(
      addDockButton({ registryEntryId: 'grid-credit', tooltip: 'Credit', group: 'Assets' }),
    ).resolves.toBe(false);

    expect(mockSaveDockConfig).not.toHaveBeenCalled();
  });
});

describe('removeDockButtons / renameDockButtons reach into menus', () => {
  const dockWith = (...options: Array<Record<string, unknown>>) => ({
    version: 1,
    buttons: [
      { type: 'ActionButton', id: 'keep', tooltip: 'Other', iconUrl: '', actionId: 'x', customData: { registryEntryId: 'grid-other' } },
      { type: 'DropdownButton', id: 'dd', tooltip: 'Assets', iconUrl: '', options },
    ],
  });
  const item = (registryEntryId: string, tooltip: string, extra: Record<string, unknown> = {}) => ({
    id: `item-${registryEntryId}`,
    tooltip,
    actionId: 'launch-component',
    customData: { registryEntryId },
    ...extra,
  });

  it('removes a menu item, leaving the group and its siblings in place', async () => {
    mockLoadDockConfig.mockResolvedValue(dockWith(item('grid-credit', 'Credit'), item('grid-rates', 'Rates')));

    await expect(removeDockButtons('grid-credit')).resolves.toBe(1);

    const saved = mockSaveDockConfig.mock.calls[0][0] as { buttons: Array<Record<string, any>> };
    const assets = saved.buttons.find((b) => b.id === 'dd')!;
    expect(assets.options.map((o: { tooltip: string }) => o.tooltip)).toEqual(['Rates']);
    // The group survives an emptying delete — it may be the user's own menu.
    expect(saved.buttons.map((b) => b.id)).toEqual(['keep', 'dd']);
  });

  it('removes nested sub-menu items too', async () => {
    mockLoadDockConfig.mockResolvedValue(
      dockWith(item('grid-parent', 'Fixed Income', { options: [item('grid-credit', 'Credit')] })),
    );

    await expect(removeDockButtons('grid-credit')).resolves.toBe(1);

    const saved = mockSaveDockConfig.mock.calls[0][0] as { buttons: Array<Record<string, any>> };
    expect(saved.buttons.find((b) => b.id === 'dd')!.options[0].options).toEqual([]);
  });

  it('reports nothing removed — and writes nothing — when no entry matches', async () => {
    mockLoadDockConfig.mockResolvedValue(dockWith(item('grid-rates', 'Rates')));

    await expect(removeDockButtons('grid-credit')).resolves.toBe(0);

    expect(mockSaveDockConfig).not.toHaveBeenCalled();
  });

  it('retitles a menu item so a rename is visible in the menu', async () => {
    mockLoadDockConfig.mockResolvedValue(dockWith(item('grid-credit', 'Credit'), item('grid-rates', 'Rates')));

    await renameDockButtons('grid-credit', 'Credit HY');

    const saved = mockSaveDockConfig.mock.calls[0][0] as { buttons: Array<Record<string, any>> };
    const assets = saved.buttons.find((b) => b.id === 'dd')!;
    expect(assets.options.map((o: { tooltip: string }) => o.tooltip)).toEqual(['Credit HY', 'Rates']);
    expect(mockPublish).toHaveBeenCalledWith('dock-config-update', saved);
  });

  it('writes nothing when a rename matches no dock entry', async () => {
    mockLoadDockConfig.mockResolvedValue(dockWith(item('grid-rates', 'Rates')));

    await renameDockButtons('grid-credit', 'Credit HY');

    expect(mockSaveDockConfig).not.toHaveBeenCalled();
  });
});
