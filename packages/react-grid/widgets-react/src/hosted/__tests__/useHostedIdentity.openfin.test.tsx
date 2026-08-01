/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { useHostedIdentity } from '../useHostedIdentity.js';

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  window.history.replaceState({}, '', '/');
});

const fakeConfigManager = { __fake: true } as unknown as ConfigManager;

describe('useHostedIdentity — OpenFin path', () => {
  beforeEach(() => {
    (globalThis as any).fin = {
      me: {
        getOptions: vi.fn().mockResolvedValue({
          customData: {
            instanceId: 'OF-INSTANCE',
            appId: 'OF-APP',
            userId: 'OF-USER',
            componentType: 'MarketsGrid',
            componentSubType: 'FX',
            isTemplate: false,
            singleton: true,
          },
        }),
      },
    };
  });

  it('reads instanceId from fin.me.getOptions().customData; appId / userId from defaults', async () => {
    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'fallback-instance',
        defaultAppId: 'fallback-app',
        defaultUserId: 'fallback-user',
        componentName: 'TestGrid',
        configManager: fakeConfigManager,
      }),
    );
    expect(result.current.ready).toBe(false);
    expect(result.current.identity.instanceId).toBeNull();
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.identity.instanceId).toBe('OF-INSTANCE');
    expect(result.current.identity.appId).toBe('fallback-app');
    expect(result.current.identity.userId).toBe('fallback-user');
    expect(result.current.identity.configManager).toBe(fakeConfigManager);
  });

  it('is ready on first paint when the launch URL stamps ?instanceId=', async () => {
    window.history.replaceState({}, '', '/?instanceId=URL-STAMPED');
    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'fallback-instance',
        componentName: 'TestGrid',
        configManager: fakeConfigManager,
      }),
    );
    expect(result.current.ready).toBe(true);
    expect(result.current.identity.instanceId).toBe('URL-STAMPED');
    await waitFor(() => expect(result.current.identity.instanceId).toBe('OF-INSTANCE'));
  });
});
