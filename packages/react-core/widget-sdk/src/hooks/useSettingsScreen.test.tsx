import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AppConfigRow } from '@wellsfargo-starui/shared-types';
import type { PlatformAdapter } from '@wellsfargo-starui/widget';

/**
 * useSettingsScreen runs in a standalone settings window: its only input is
 * the URL its opener built, and its only outputs are a config write plus two
 * broadcasts. Both are asserted here; the ConfigManager is mocked at the
 * module edge.
 *
 * Each test uses a distinct parentConfigId — WidgetHost shares a
 * module-level QueryClient with a 30s staleTime.
 */

const rows = new Map<string, AppConfigRow>();

function row(overrides: Partial<AppConfigRow> = {}): AppConfigRow {
  return {
    configId: 'cfg-1',
    appId: 'star-demo',
    userId: 'k123',
    componentType: 'GRID',
    componentSubType: 'CREDIT',
    isTemplate: false,
    displayText: 'Blotter',
    payload: {},
    createdBy: 'k123',
    updatedBy: 'k123',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const updateConfig = vi.fn();
const configManager = {
  init: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn(),
  getConfig: vi.fn(async (id: string) => rows.get(id)),
  updateConfig: (...args: unknown[]) => updateConfig(...args),
};

vi.mock('@wellsfargo-starui/host-config', () => ({
  createConfigManager: () => configManager,
}));

const { WidgetHost } = await import('../providers/WidgetHost.js');
const { useSettingsScreen } = await import('./useSettingsScreen.js');

const broadcast = vi.fn();
const platform = {
  name: 'fake',
  isOpenFin: false,
  broadcast,
  subscribe: vi.fn(() => () => undefined),
  onPlatformSave: vi.fn(() => () => undefined),
  onPlatformDestroy: vi.fn(() => () => undefined),
  getInstanceId: () => 'inst-1',
  getLaunchData: () => null,
} as unknown as PlatformAdapter;

function Wrapper({ children }: { children: ReactNode }) {
  return <WidgetHost apiUrl="" userId="k123" platform={platform}>{children}</WidgetHost>;
}

/** Put the settings window at the URL its opener would have built. */
function atUrl(search: string) {
  window.history.replaceState({}, '', `/settings${search}`);
}

beforeEach(() => {
  rows.clear();
  vi.clearAllMocks();
  atUrl('');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useSettingsScreen', () => {
  it('reads the parent identity out of the URL', () => {
    atUrl('?parentConfigId=cfg-a&parentInstanceId=inst-a&parentViewId=view-a');
    const { result } = renderHook(() => useSettingsScreen(), { wrapper: Wrapper });

    expect(result.current.parentConfigId).toBe('cfg-a');
    expect(result.current.parentInstanceId).toBe('inst-a');
    expect(result.current.parentViewId).toBe('view-a');
  });

  it('defaults the parent identity to empty strings when the URL carries none', () => {
    const { result } = renderHook(() => useSettingsScreen(), { wrapper: Wrapper });

    // Empty string rather than null keeps the query disabled and keeps
    // `broadcast` payloads a stable shape for the parent's listener.
    expect(result.current.parentConfigId).toBe('');
    expect(result.current.parentInstanceId).toBe('');
    expect(result.current.launchData).toBeNull();
  });

  it('loads the parent config', async () => {
    rows.set('cfg-load', row({ configId: 'cfg-load', displayText: 'Parent blotter' }));
    atUrl('?parentConfigId=cfg-load');
    const { result } = renderHook(() => useSettingsScreen(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.config?.displayText).toBe('Parent blotter'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not query when no parentConfigId was passed', () => {
    renderHook(() => useSettingsScreen(), { wrapper: Wrapper });
    expect(configManager.getConfig).not.toHaveBeenCalled();
  });

  it('decodes base64 launch data from the URL', () => {
    const data = btoa(JSON.stringify({ tab: 'columns', rowIds: [1, 2] }));
    atUrl(`?parentConfigId=cfg-launch&data=${encodeURIComponent(data)}`);
    const { result } = renderHook(() => useSettingsScreen(), { wrapper: Wrapper });

    expect(result.current.launchData).toEqual({ tab: 'columns', rowIds: [1, 2] });
  });

  it('treats undecodable launch data as absent instead of throwing', () => {
    // The opener builds this param; a truncated or non-JSON value must not
    // take the whole settings screen down.
    atUrl('?parentConfigId=cfg-baddata&data=not-base64-json');
    const { result } = renderHook(() => useSettingsScreen(), { wrapper: Wrapper });

    expect(result.current.launchData).toBeNull();
  });

  it('saveConfig writes the patch and tells the parent it saved', async () => {
    rows.set('cfg-save', row({ configId: 'cfg-save' }));
    atUrl('?parentConfigId=cfg-save&parentInstanceId=inst-save');
    const { result } = renderHook(() => useSettingsScreen(), { wrapper: Wrapper });

    await act(async () => { await result.current.saveConfig({ displayText: 'Renamed' }); });

    expect(updateConfig).toHaveBeenCalledWith('cfg-save', { displayText: 'Renamed' });
    expect(broadcast).toHaveBeenCalledWith('settings-saved', {
      parentConfigId: 'cfg-save',
      parentInstanceId: 'inst-save',
      updates: { displayText: 'Renamed' },
    });
  });

  it('close routes the result back to the opening instance and closes the window', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    atUrl('?parentConfigId=cfg-close&parentInstanceId=inst-close');
    const { result } = renderHook(() => useSettingsScreen(), { wrapper: Wrapper });

    act(() => { result.current.close({ applied: true }); });

    // targetId is what lets the parent ignore results from other settings
    // windows sharing the same BroadcastChannel.
    expect(broadcast).toHaveBeenCalledWith('settings-result', {
      type: 'settings-result',
      targetId: 'inst-close',
      result: { applied: true },
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('close with no result still closes and notifies', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    atUrl('?parentConfigId=cfg-cancel&parentInstanceId=inst-cancel');
    const { result } = renderHook(() => useSettingsScreen(), { wrapper: Wrapper });

    act(() => { result.current.close(); });

    expect(broadcast).toHaveBeenCalledWith('settings-result', {
      type: 'settings-result',
      targetId: 'inst-cancel',
      result: undefined,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
