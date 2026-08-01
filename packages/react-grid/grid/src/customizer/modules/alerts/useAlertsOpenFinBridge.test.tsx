/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import type { AlertsState } from '@wellsfargo-starui/core';
import { useAlertsOpenFinBridge } from './useAlertsOpenFinBridge';
import { alertsModule } from './index';

const loadOpenFinNotificationsApi = vi.fn();
const dispatchOpenFinNotification = vi.fn();

vi.mock('@wellsfargo-starui/openfin/host', () => ({
  loadOpenFinNotificationsApi: (...args: unknown[]) => loadOpenFinNotificationsApi(...args),
  dispatchOpenFinNotification: (...args: unknown[]) => dispatchOpenFinNotification(...args),
}));

describe('useAlertsOpenFinBridge', () => {
  beforeEach(() => {
    loadOpenFinNotificationsApi.mockReset();
    dispatchOpenFinNotification.mockReset();
    loadOpenFinNotificationsApi.mockResolvedValue({ register: vi.fn().mockResolvedValue(undefined) });
    dispatchOpenFinNotification.mockResolvedValue(undefined);
    Object.defineProperty(window, 'fin', {
      configurable: true,
      value: { me: { identity: { uuid: 'app-uuid' } } },
    });
  });

  afterEach(() => {
    delete (window as { fin?: unknown }).fin;
  });

  it('no-ops when platform is null', () => {
    renderHook(() => useAlertsOpenFinBridge(null));
    expect(loadOpenFinNotificationsApi).not.toHaveBeenCalled();
  });

  it('dispatches fresh openfin-channel notifications', async () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    platform.store.setModuleState<AlertsState>('alerts', () => ({
      rules: [{
        id: 'rule-1',
        name: 'Spike',
        enabled: true,
        priority: 0,
        severity: 'warning',
        trigger: { kind: 'dataChange', expression: 'true' },
        message: 'hi',
        channels: ['openfin'],
      }],
      history: [],
      settings: {
        enabled: true,
        evaluationMode: 'realtime',
        defaultDebounceMs: 0,
        maxNotificationsPerSecond: 10,
        historyLimit: 100,
        enabledChannels: { toast: false, badge: false, openfin: true },
      },
    }));

    renderHook(() => useAlertsOpenFinBridge(platform));

    await waitFor(() => {
      expect(loadOpenFinNotificationsApi).toHaveBeenCalled();
    });

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({
      ...s,
      history: [{
        id: 'n1',
        ruleId: 'rule-1',
        ruleName: 'Spike',
        message: 'Price moved',
        severity: 'warning',
        firedAt: Date.now(),
        read: false,
      }],
    }));

    await waitFor(() => {
      expect(dispatchOpenFinNotification).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: 'Spike',
          body: 'Price moved',
          category: 'warning',
        }),
      );
    });
  });
});
