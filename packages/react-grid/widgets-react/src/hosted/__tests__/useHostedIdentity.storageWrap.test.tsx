/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ConfigManager } from '@wellsfargo-starui/host-config';

// Mock createConfigServiceStorage so we can observe the per-call opts
// the wrapper passes to the underlying factory.
const innerAdapter = { __innerAdapter: true };
const innerFactory = vi.fn(() => innerAdapter);
const createConfigServiceStorageMock = vi.fn(() => innerFactory);

vi.mock('@wellsfargo-starui/host-config', async () => {
  const actual = await vi.importActual<typeof import('@wellsfargo-starui/host-config')>(
    '@wellsfargo-starui/host-config',
  );
  return {
    ...actual,
    createConfigServiceStorage: createConfigServiceStorageMock,
  };
});

// Import the hook AFTER vi.mock so the mock is in place.
const { useHostedIdentity } = await import('../useHostedIdentity.js');

const fakeConfigManager = { __fake: true } as unknown as ConfigManager;

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  innerFactory.mockClear();
  createConfigServiceStorageMock.mockClear();
});

describe('useHostedIdentity — storage factory wrapping', () => {
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
            isTemplate: true,
            singleton: false,
          },
        }),
      },
    };
  });

  it('injects registeredIdentity into every adapter call when withStorage is set', async () => {
    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'fallback',
        componentName: 'TestGrid',
        withStorage: true,
        configManager: fakeConfigManager,
      }),
    );

    // Wait until the OpenFin async resolution lands — that's the same
    // tick that sets registeredIdentity, after which the storage memo
    // re-runs with the wrap in place. (`ready` is now true synchronously,
    // so it can't be used to await the registeredIdentity refine.)
    await waitFor(() => expect(result.current.identity.storage).not.toBe(innerFactory));

    // Build the underlying factory once with the resolved configManager.
    expect(createConfigServiceStorageMock).toHaveBeenCalledWith({
      configManager: fakeConfigManager,
    });

    const adapter = result.current.identity.storage!({
      instanceId: 'OF-INSTANCE',
      appId: 'OF-APP',
      userId: 'OF-USER',
    });
    expect(adapter).toBe(innerAdapter);

    expect(innerFactory).toHaveBeenCalledTimes(1);
    expect(innerFactory).toHaveBeenCalledWith({
      instanceId: 'OF-INSTANCE',
      appId: 'OF-APP',
      userId: 'OF-USER',
      registeredIdentity: {
        componentType: 'MarketsGrid',
        componentSubType: 'FX',
        isTemplate: true,
        singleton: false,
      },
    });

    // Repeated calls keep injecting registeredIdentity — the wrap is
    // not a one-shot.
    result.current.identity.storage!({ instanceId: 'OF-INSTANCE' });
    expect(innerFactory).toHaveBeenCalledTimes(2);
    expect(innerFactory.mock.calls[1][0]).toMatchObject({
      registeredIdentity: { componentType: 'MarketsGrid' },
    });
  });

  it('returns the bare inner factory when registeredIdentity is unavailable', async () => {
    delete (globalThis as any).fin;

    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'fallback',
        componentName: 'TestGrid',
        withStorage: true,
        configManager: fakeConfigManager,
      }),
    );

    await waitFor(() => expect(result.current.identity.storage).not.toBeNull());
    // The hook returns the inner factory directly (no wrapping function)
    // when there is no registered-component metadata.
    expect(result.current.identity.storage).toBe(innerFactory);
  });

  it('returns null storage when withStorage is false', async () => {
    const { result } = renderHook(() =>
      useHostedIdentity({
        defaultInstanceId: 'fallback',
        componentName: 'TestGrid',
        configManager: fakeConfigManager,
      }),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.identity.storage).toBeNull();
  });
});
