import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * useHostedStarui reshapes useHostedIdentity's result into the StarGrid
 * identity contract: the hook itself owns readiness (id AND storage AND
 * ConfigManager) so views gate on one flag instead of three fields.
 */

const { hostedRef } = vi.hoisted(() => ({
  hostedRef: {
    current: {
      identity: {
        instanceId: 'view-1',
        appId: 'App1',
        userId: 'u1',
        configManager: { getAppId: () => 'App1' },
        storage: (() => ({})) as unknown,
      } as Record<string, unknown>,
      ready: true,
    },
  },
}));

vi.mock('./useHostedIdentity.js', () => ({
  useHostedIdentity: () => hostedRef.current,
}));

const { platformRef } = vi.hoisted(() => ({
  platformRef: { current: { appId: 'App1', userId: 'u1' } as { appId: string; userId: string } | null },
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  usePlatformIdentityOrNull: () => platformRef.current,
}));

import { useHostedStarui } from './useHostedStarui.js';

const SENTINEL = 'hosted-mg.legacy-cleanup';

describe('useHostedStarui', () => {
  it('shapes a ready hosted identity for StaruiIdentityProvider', () => {
    const { result } = renderHook(() =>
      useHostedStarui({ defaultGridId: 'blotter' }),
    );
    expect(result.current.ready).toBe(true);
    expect(result.current.gridId).toBe('view-1');
    expect(result.current.identity).toMatchObject({ appId: 'App1', userId: 'u1' });
    expect(typeof result.current.identity?.storage).toBe('function');
  });

  it('runs the legacy view-state cleanup once, sets the sentinel, then skips', async () => {
    window.localStorage.removeItem(SENTINEL);
    const deleteConfig = vi.fn().mockResolvedValue(undefined);
    hostedRef.current = {
      identity: {
        instanceId: 'lc-1',
        appId: 'App1',
        userId: 'u1',
        configManager: { getAppId: () => 'App1', deleteConfig },
        storage: (() => ({})) as unknown,
      },
      ready: true,
    };
    const first = renderHook(() => useHostedStarui({ defaultGridId: 'lc-1' }));
    await vi.waitFor(() => expect(deleteConfig).toHaveBeenCalledTimes(1));
    expect(deleteConfig).toHaveBeenCalledWith('marketsgrid-view-state::lc-1');
    await vi.waitFor(() => expect(window.localStorage.getItem(SENTINEL)).toBe('1'));
    first.unmount();

    // Second mount must observe the sentinel and skip the cleanup.
    renderHook(() => useHostedStarui({ defaultGridId: 'lc-2' }));
    await new Promise((r) => setTimeout(r, 10));
    expect(deleteConfig).toHaveBeenCalledTimes(1);
  });

  it('refuses the dev-default identity unless devDefaults is opted in', () => {
    platformRef.current = null;
    hostedRef.current = {
      identity: {
        instanceId: 'view-1',
        appId: 'TestApp',
        userId: 'dev1',
        configManager: {},
        storage: (() => ({})) as unknown,
      },
      ready: true,
    };
    const blocked = renderHook(() => useHostedStarui({ defaultGridId: 'blotter' }));
    expect(blocked.result.current.ready).toBe(false);
    expect(blocked.result.current.identity).toBeNull();

    const optedIn = renderHook(() =>
      useHostedStarui({ defaultGridId: 'blotter', devDefaults: true }),
    );
    expect(optedIn.result.current.ready).toBe(true);
    expect(optedIn.result.current.identity).toMatchObject({ appId: 'TestApp', userId: 'dev1' });
    platformRef.current = { appId: 'App1', userId: 'u1' };
  });

  it('stays not-ready until the storage factory resolves', () => {
    hostedRef.current = {
      identity: {
        instanceId: 'view-1',
        appId: 'App1',
        userId: 'u1',
        configManager: null,
        storage: null,
      },
      ready: true,
    };
    const { result } = renderHook(() =>
      useHostedStarui({ defaultGridId: 'blotter' }),
    );
    expect(result.current.ready).toBe(false);
    expect(result.current.identity).toBeNull();
  });
});
