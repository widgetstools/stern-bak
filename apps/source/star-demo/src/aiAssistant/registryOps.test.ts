import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { addRegistryEntry, addDockButton, registryEntryExists, buildRegistryEntry } from './registryOps';
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
});
