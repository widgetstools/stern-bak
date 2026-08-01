/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/engine';
import type { AlertsState } from '@wellsfargo-starui/engine';
import { useAlertsToastBridge } from './useAlertsToastBridge';
import { alertsModule } from './index';

vi.mock('@wellsfargo-starui/react', () => ({
  toast: vi.fn(),
}));

import { toast } from '@wellsfargo-starui/react';

describe('useAlertsToastBridge', () => {
  beforeEach(() => {
    vi.mocked(toast).mockClear();
  });

  it('no-ops when platform is null', () => {
    renderHook(() => useAlertsToastBridge(null));
    expect(toast).not.toHaveBeenCalled();
  });

  it('toasts fresh notifications that request the toast channel', () => {
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
        channels: ['toast'],
      }],
      history: [],
      settings: {
        enabled: true,
        evaluationMode: 'realtime',
        defaultDebounceMs: 0,
        maxNotificationsPerSecond: 10,
        historyLimit: 100,
        enabledChannels: { toast: true, badge: true, openfin: false },
      },
    }));

    renderHook(() => useAlertsToastBridge(platform));

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

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Spike',
      description: 'Price moved',
    }));
  });
});
