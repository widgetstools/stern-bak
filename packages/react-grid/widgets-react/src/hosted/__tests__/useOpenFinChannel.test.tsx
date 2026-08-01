/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, act, waitFor } from '@testing-library/react';
import { useOpenFinChannel } from '../useOpenFinChannel.js';

interface FakeProvider {
  register: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  connections: Array<{ uuid: string; name?: string }>;
}

interface FakeClient {
  register: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function makeProvider(): FakeProvider {
  return {
    register: vi.fn().mockReturnValue(true),
    publish: vi.fn().mockResolvedValue([]),
    dispatch: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    connections: [],
  };
}

function makeClient(): FakeClient {
  return {
    register: vi.fn().mockReturnValue(true),
    dispatch: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

function installFin(provider: FakeProvider, client: FakeClient) {
  (globalThis as any).fin = {
    InterApplicationBus: {
      Channel: {
        create: vi.fn().mockResolvedValue(provider),
        connect: vi.fn().mockResolvedValue(client),
      },
    },
  };
}

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  vi.restoreAllMocks();
});

describe('useOpenFinChannel — OpenFin runtime', () => {
  let provider: FakeProvider;
  let client: FakeClient;

  beforeEach(() => {
    provider = makeProvider();
    client = makeClient();
    installFin(provider, client);
  });

  it('createProvider wraps Channel.create and registers actions', async () => {
    const { result } = renderHook(() => useOpenFinChannel());
    const handler = vi.fn();
    let returned: unknown;
    await act(async () => {
      returned = await result.current.createProvider('chan-1', { ping: handler });
    });
    expect(returned).toBe(provider);
    expect((globalThis as any).fin.InterApplicationBus.Channel.create)
      .toHaveBeenCalledWith('chan-1');
    expect(provider.register).toHaveBeenCalledWith('ping', handler);
  });

  it('connect wraps Channel.connect', async () => {
    const { result } = renderHook(() => useOpenFinChannel());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.connect('chan-2');
    });
    expect(returned).toBe(client);
    expect((globalThis as any).fin.InterApplicationBus.Channel.connect)
      .toHaveBeenCalledWith('chan-2');
  });

  it('unmount destroys every created provider and disconnects every client', async () => {
    const { result, unmount } = renderHook(() => useOpenFinChannel());
    await act(async () => {
      await result.current.createProvider('p');
      await result.current.connect('c');
    });
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(client.disconnect).not.toHaveBeenCalled();

    unmount();

    await waitFor(() => {
      expect(provider.destroy).toHaveBeenCalledTimes(1);
      expect(client.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  it('createProvider and connect identities are stable across renders', () => {
    const { result, rerender } = renderHook(() => useOpenFinChannel());
    const c1 = result.current.createProvider;
    const k1 = result.current.connect;
    rerender();
    expect(result.current.createProvider).toBe(c1);
    expect(result.current.connect).toBe(k1);
  });
});

describe('useOpenFinChannel — non-OpenFin runtime', () => {
  it('createProvider rejects', async () => {
    const { result } = renderHook(() => useOpenFinChannel());
    await expect(result.current.createProvider('x')).rejects.toThrow(
      'OpenFin runtime not present',
    );
  });

  it('connect rejects', async () => {
    const { result } = renderHook(() => useOpenFinChannel());
    await expect(result.current.connect('x')).rejects.toThrow(
      'OpenFin runtime not present',
    );
  });
});
