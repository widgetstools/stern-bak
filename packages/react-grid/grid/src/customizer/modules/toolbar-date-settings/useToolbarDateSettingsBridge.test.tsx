/**
 * @vitest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider } from '../../hooks/GridProvider';
import { toolbarDateSettingsModule } from './index';
import { INITIAL_TOOLBAR_DATE_SETTINGS } from './state';
import { useToolbarDateSettingsBridge } from './useToolbarDateSettingsBridge';

function makePlatform(settings = INITIAL_TOOLBAR_DATE_SETTINGS) {
  const platform = new GridPlatform({
    gridId: 'tds-bridge',
    modules: [toolbarDateSettingsModule],
  });
  platform.store.setModuleState('toolbar-date-settings', () => ({ ...settings }));
  return platform;
}

describe('useToolbarDateSettingsBridge', () => {
  it('resolves history enabled from explicit prop', () => {
    const onChange = vi.fn();
    const platform = makePlatform();
    const { result } = renderHook(
      () => useToolbarDateSettingsBridge({
        toolbarDate: '2024-01-01',
        onToolbarDateChange: onChange,
        toolbarDateHistoryEnabled: true,
      }),
      { wrapper: ({ children }) => <GridProvider platform={platform}>{children}</GridProvider> },
    );
    expect(result.current.toolbarDateHistoryEnabled).toBe(true);
  });

  it('resolves history enabled from module settings when prop omitted', () => {
    const onChange = vi.fn();
    const platform = makePlatform({
      ...INITIAL_TOOLBAR_DATE_SETTINGS,
      historicalDateAppDataEnabled: true,
      historicalDateAppDataProvider: 'prov',
      historicalDateAppDataKey: 'asOf',
    });
    const { result } = renderHook(
      () => useToolbarDateSettingsBridge({
        toolbarDate: '2024-01-01',
        onToolbarDateChange: onChange,
        toolbarDateHistoryEnabled: undefined,
      }),
      { wrapper: ({ children }) => <GridProvider platform={platform}>{children}</GridProvider> },
    );
    expect(result.current.toolbarDateHistoryEnabled).toBe(true);
  });

  it('snaps to today when history is disabled and date is stale', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'));
    const onChange = vi.fn();
    const platform = makePlatform({
      ...INITIAL_TOOLBAR_DATE_SETTINGS,
      historicalDateAppDataEnabled: false,
    });
    renderHook(
      () => useToolbarDateSettingsBridge({
        toolbarDate: '2020-01-01',
        onToolbarDateChange: onChange,
        toolbarDateHistoryEnabled: false,
      }),
      { wrapper: ({ children }) => <GridProvider platform={platform}>{children}</GridProvider> },
    );
    expect(onChange).toHaveBeenCalledWith('2026-08-01');
    vi.useRealTimers();
  });

  it('forwards toolbar date changes through the bridge callback', () => {
    const onChange = vi.fn();
    const platform = makePlatform();
    const { result } = renderHook(
      () => useToolbarDateSettingsBridge({
        toolbarDate: '2026-08-01',
        onToolbarDateChange: onChange,
        toolbarDateHistoryEnabled: true,
      }),
      { wrapper: ({ children }) => <GridProvider platform={platform}>{children}</GridProvider> },
    );
    act(() => {
      result.current.onToolbarDateChange('2026-08-02');
    });
    expect(onChange).toHaveBeenCalledWith('2026-08-02');
  });
});
