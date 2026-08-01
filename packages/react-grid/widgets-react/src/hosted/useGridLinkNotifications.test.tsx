/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useGridLinkNotifications } from './useGridLinkNotifications.js';

const dispatchOpenFinNotification = vi.fn().mockResolvedValue(undefined);
const loadOpenFinNotificationsApi = vi.fn().mockResolvedValue({ post: vi.fn() });

vi.mock('@wellsfargo-starui/openfin/host', () => ({
  loadOpenFinNotificationsApi: (...args: unknown[]) => loadOpenFinNotificationsApi(...args),
  dispatchOpenFinNotification: (...args: unknown[]) => dispatchOpenFinNotification(...args),
}));

afterEach(() => {
  cleanup();
  delete (window as any).fin;
  vi.clearAllMocks();
});

describe('useGridLinkNotifications', () => {
  it('no-ops when disabled', async () => {
    const { result } = renderHook(() =>
      useGridLinkNotifications({ instanceId: 'g1', enabled: false }),
    );
    act(() => {
      result.current.onPublish({
        type: 'starui.gridSelection',
        criteria: { positionId: ['A'] },
        source: 'peer',
      });
    });
    await waitFor(() => expect(loadOpenFinNotificationsApi).not.toHaveBeenCalled());
  });

  it('no-ops outside OpenFin even when enabled', async () => {
    const { result } = renderHook(() =>
      useGridLinkNotifications({ instanceId: 'g1', enabled: true }),
    );
    act(() => {
      result.current.onPublish({
        type: 'starui.gridSelection',
        criteria: { positionId: ['A'] },
        source: 'peer',
      });
    });
    await waitFor(() => expect(loadOpenFinNotificationsApi).not.toHaveBeenCalled());
  });

  it('dispatches when OpenFin is present and enabled', async () => {
    (window as any).fin = { me: { identity: { uuid: 'win-1' } } };
    const { result } = renderHook(() =>
      useGridLinkNotifications({ instanceId: 'g2', enabled: true }),
    );
    act(() => {
      result.current.onReceive({
        type: 'starui.gridSelection',
        criteria: { positionId: ['ABC'] },
        source: 'grid-1',
      });
    });
    await waitFor(() => expect(dispatchOpenFinNotification).toHaveBeenCalled());
  });

  it('swallows when notifications API is unavailable', async () => {
    (window as any).fin = { me: { identity: { uuid: 'win-1' } } };
    loadOpenFinNotificationsApi.mockResolvedValueOnce(null);
    const { result } = renderHook(() =>
      useGridLinkNotifications({ instanceId: 'g2', enabled: true }),
    );
    act(() => {
      result.current.onPublish({
        type: 'starui.gridSelection',
        criteria: { positionId: ['A'] },
        source: 'grid-1',
      });
    });
    await waitFor(() => expect(loadOpenFinNotificationsApi).toHaveBeenCalled());
    expect(dispatchOpenFinNotification).not.toHaveBeenCalled();
  });
});
