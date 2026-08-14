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

import { useHostedStarui } from './useHostedStarui.js';

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
