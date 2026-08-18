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

vi.mock('@wellsfargo-starui/openfin/host', async (importOriginal) => ({
  // Real isOpenFin/getOpenFinWindowIdentity — the suite drives them by
  // stubbing window.fin; only the notification pair is intercepted.
  ...(await importOriginal<typeof import('@wellsfargo-starui/openfin/host')>()),
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

  /** Alerts state with one openfin rule and whatever history is given. */
  function seed(
    platform: GridPlatform,
    over: Partial<AlertsState> = {},
    channels: Array<'toast' | 'badge' | 'openfin'> = ['openfin'],
  ) {
    platform.store.setModuleState<AlertsState>('alerts', () => ({
      rules: [{
        id: 'rule-1',
        name: 'Spike',
        enabled: true,
        priority: 0,
        severity: 'warning',
        trigger: { kind: 'dataChange', expression: 'true' },
        message: 'hi',
        channels,
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
      ...over,
    } as AlertsState));
  }

  const note = (id: string, ruleId = 'rule-1') => ({
    id,
    ruleId,
    ruleName: 'Spike',
    message: `msg-${id}`,
    severity: 'warning' as const,
    firedAt: 1,
    read: false,
  });

  /** Mount the bridge and wait until it has loaded the notifications API. */
  async function mount(platform: GridPlatform) {
    const view = renderHook(() => useAlertsOpenFinBridge(platform));
    await waitFor(() => expect(loadOpenFinNotificationsApi).toHaveBeenCalled());
    return view;
  }

  it('never loads the OpenFin package in a plain browser', () => {
    delete (window as { fin?: unknown }).fin;
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });

    renderHook(() => useAlertsOpenFinBridge(platform));
    expect(loadOpenFinNotificationsApi).not.toHaveBeenCalled();
  });

  it('gives up quietly when the notifications API will not load', async () => {
    loadOpenFinNotificationsApi.mockResolvedValue(null);
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform);
    await mount(platform);

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({ ...s, history: [note('n1')] }));
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchOpenFinNotification).not.toHaveBeenCalled();
  });

  it('carries on when another consumer already registered the provider', async () => {
    loadOpenFinNotificationsApi.mockResolvedValue({
      register: vi.fn().mockRejectedValue(new Error('already registered')),
    });
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform);
    await mount(platform);

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({ ...s, history: [note('n1')] }));
    await waitFor(() => expect(dispatchOpenFinNotification).toHaveBeenCalled());
  });

  it('works against a notifications API with no register method', async () => {
    loadOpenFinNotificationsApi.mockResolvedValue({});
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform);
    await mount(platform);

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({ ...s, history: [note('n1')] }));
    await waitFor(() => expect(dispatchOpenFinNotification).toHaveBeenCalled());
  });

  it('does not replay the history a profile load brought with it', async () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform, { history: [note('old-1'), note('old-2')] });
    await mount(platform);

    // Give the subscription a tick to fire on the seeded state.
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchOpenFinNotification).not.toHaveBeenCalled();
  });

  it('dispatches oldest first so the notification centre reads in order', async () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform);
    await mount(platform);

    // History is newest-first, as the module keeps it.
    platform.store.setModuleState<AlertsState>('alerts', (s) => ({
      ...s,
      history: [note('n3'), note('n2'), note('n1')],
    }));

    await waitFor(() => expect(dispatchOpenFinNotification).toHaveBeenCalledTimes(3));
    expect(
      dispatchOpenFinNotification.mock.calls.map((c) => (c[1] as { body: string }).body),
    ).toEqual(['msg-n1', 'msg-n2', 'msg-n3']);
  });

  it('stops at the first entry it has already sent', async () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform);
    await mount(platform);

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({ ...s, history: [note('n1')] }));
    await waitFor(() => expect(dispatchOpenFinNotification).toHaveBeenCalledTimes(1));

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({
      ...s,
      history: [note('n2'), note('n1')],
    }));
    await waitFor(() => expect(dispatchOpenFinNotification).toHaveBeenCalledTimes(2));
  });

  it('ignores a state change that adds nothing new', async () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform);
    await mount(platform);

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({ ...s, history: [note('n1')] }));
    await waitFor(() => expect(dispatchOpenFinNotification).toHaveBeenCalledTimes(1));

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({ ...s, historyLimit: 50 } as never));
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchOpenFinNotification).toHaveBeenCalledTimes(1);
  });

  it('marks a notification seen even while the channel is off', async () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform);
    await mount(platform);
    platform.store.setModuleState<AlertsState>('alerts', (s) => ({
      ...s,
      settings: { ...s!.settings, enabledChannels: { ...s!.settings.enabledChannels, openfin: false } },
      history: [note('n1')],
    }));
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchOpenFinNotification).not.toHaveBeenCalled();

    // Turning the channel back on must not replay what fired while it was off.
    platform.store.setModuleState<AlertsState>('alerts', (s) => ({
      ...s,
      settings: { ...s!.settings, enabledChannels: { ...s!.settings.enabledChannels, openfin: true } },
    }));
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchOpenFinNotification).not.toHaveBeenCalled();
  });

  it('stays silent while alerts are switched off entirely', async () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform);
    await mount(platform);

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({
      ...s,
      settings: { ...s!.settings, enabled: false },
      history: [note('n1')],
    }));
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchOpenFinNotification).not.toHaveBeenCalled();
  });

  it('skips a notification whose rule does not name the openfin channel', async () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform, {}, ['toast']);
    await mount(platform);

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({ ...s, history: [note('n1')] }));
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchOpenFinNotification).not.toHaveBeenCalled();
  });

  it('skips a notification whose rule no longer exists', async () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform);
    await mount(platform);

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({
      ...s,
      history: [note('n1', 'deleted-rule')],
    }));
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchOpenFinNotification).not.toHaveBeenCalled();
  });

  it('carries the alert identity through as custom data', async () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform);
    await mount(platform);

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({
      ...s,
      history: [{ ...note('n1'), rowId: 'r7', column: 'px' }],
    }));

    await waitFor(() => expect(dispatchOpenFinNotification).toHaveBeenCalled());
    expect(dispatchOpenFinNotification.mock.calls[0][1]).toMatchObject({
      platformUuid: 'app-uuid',
      customData: {
        ruleId: 'rule-1',
        notificationId: 'n1',
        rowId: 'r7',
        column: 'px',
        severity: 'warning',
      },
    });
  });

  it('stops dispatching once unmounted', async () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [alertsModule] });
    seed(platform);
    const { unmount } = await mount(platform);
    unmount();

    platform.store.setModuleState<AlertsState>('alerts', (s) => ({ ...s, history: [note('n1')] }));
    await new Promise((r) => setTimeout(r, 0));
    expect(dispatchOpenFinNotification).not.toHaveBeenCalled();
  });
});
