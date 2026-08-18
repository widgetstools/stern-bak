/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { useWorkspaceSaveEvent } from '../useWorkspaceSaveEvent.js';

interface FakeClient {
  handlers: Map<string, (payload: any) => any>;
  register: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function makeClient(): FakeClient {
  const handlers = new Map<string, (payload: any) => any>();
  return {
    handlers,
    register: vi.fn((action: string, fn: (payload: any) => any) => {
      handlers.set(action, fn);
      return true;
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

function installFin(client: FakeClient | null) {
  (globalThis as any).fin = client
    ? {
        InterApplicationBus: {
          Channel: {
            connect: vi.fn().mockResolvedValue(client),
          },
        },
      }
    : {};
}

afterEach(() => {
  cleanup();
  delete (globalThis as any).fin;
  vi.restoreAllMocks();
});

describe('useWorkspaceSaveEvent — OpenFin runtime', () => {
  let client: FakeClient;

  beforeEach(() => {
    client = makeClient();
    installFin(client);
  });

  it('connects to the workspace-save channel and registers workspace-saving', async () => {
    const cb = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useWorkspaceSaveEvent(cb));

    await waitFor(() => {
      expect(client.handlers.has('workspace-saving')).toBe(true);
    });
    const connect = (globalThis as any).fin.InterApplicationBus.Channel.connect;
    expect(connect).toHaveBeenCalledWith('marketsui-workspace-save-channel');
  });

  it('the registered handler awaits the user callback', async () => {
    let resolveCb: (() => void) | null = null;
    const cb = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolveCb = r;
        }),
    );

    renderHook(() => useWorkspaceSaveEvent(cb));

    await waitFor(() => {
      expect(client.handlers.has('workspace-saving')).toBe(true);
    });

    const handler = client.handlers.get('workspace-saving')!;
    let settled = false;
    const handlerPromise = handler({ workspaceId: 'ws1' });
    void handlerPromise.then(() => {
      settled = true;
    });

    // Give the microtask queue a chance — handler must NOT have resolved yet
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(cb).toHaveBeenCalledTimes(1);

    resolveCb!();
    await handlerPromise;
    expect(settled).toBe(true);
  });

  it('forwards workspace-saved payload to onSaved listener', async () => {
    const onSaved = vi.fn();
    renderHook(() =>
      useWorkspaceSaveEvent(vi.fn(), { onSaved }),
    );

    await waitFor(() => {
      expect(client.handlers.has('workspace-saved')).toBe(true);
    });
    const handler = client.handlers.get('workspace-saved')!;
    handler({ workspaceId: 'ws-7' });
    expect(onSaved).toHaveBeenCalledWith('ws-7');
  });

  it('disconnects on unmount', async () => {
    const { unmount } = renderHook(() => useWorkspaceSaveEvent(vi.fn()));
    await waitFor(() => {
      expect(client.register).toHaveBeenCalled();
    });
    unmount();
    await waitFor(() => {
      expect(client.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  it('does not connect when saveCb is undefined', async () => {
    renderHook(() => useWorkspaceSaveEvent(undefined));
    // Let any pending async settle
    await act(async () => {
      await Promise.resolve();
    });
    const connect = (globalThis as any).fin.InterApplicationBus.Channel.connect;
    expect(connect).not.toHaveBeenCalled();
  });

  it('reads the latest callback through a ref (no reconnect on identity change)', async () => {
    const cb1 = vi.fn().mockResolvedValue(undefined);
    const cb2 = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ cb }: { cb: () => Promise<void> }) => useWorkspaceSaveEvent(cb),
      { initialProps: { cb: cb1 } },
    );

    await waitFor(() => {
      expect(client.handlers.has('workspace-saving')).toBe(true);
    });
    const connect = (globalThis as any).fin.InterApplicationBus.Channel.connect;
    expect(connect).toHaveBeenCalledTimes(1);

    rerender({ cb: cb2 });
    // Allow effects to flush
    await act(async () => {
      await Promise.resolve();
    });
    expect(connect).toHaveBeenCalledTimes(1);

    const handler = client.handlers.get('workspace-saving')!;
    await handler({ workspaceId: 'x' });
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});

describe('useWorkspaceSaveEvent — non-OpenFin runtime', () => {
  it('does nothing when fin is undefined', async () => {
    // No fin installed
    const cb = vi.fn();
    const { unmount } = renderHook(() => useWorkspaceSaveEvent(cb));
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('useWorkspaceSaveEvent — failure paths', () => {
  it('warns and stays quiet when the connect rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (globalThis as any).fin = {
      InterApplicationBus: {
        Channel: { connect: vi.fn().mockRejectedValue(new Error('no provider')) },
      },
    };

    const { unmount } = renderHook(() => useWorkspaceSaveEvent(vi.fn()));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    // No client to release — unmount must not throw.
    expect(() => unmount()).not.toThrow();
  });

  it('registers nothing when the runtime has no Channel API', async () => {
    (globalThis as any).fin = {
      InterApplicationBus: { Channel: { connect: vi.fn().mockResolvedValue(null) } },
    };
    const cb = vi.fn();

    const { unmount } = renderHook(() => useWorkspaceSaveEvent(cb));
    await act(async () => { await Promise.resolve(); });
    unmount();
    expect(cb).not.toHaveBeenCalled();
  });

  it('drops a connection that resolved after unmount', async () => {
    const client = makeClient();
    let resolveConnect: ((c: FakeClient) => void) | null = null;
    (globalThis as any).fin = {
      InterApplicationBus: {
        Channel: {
          connect: vi.fn(() => new Promise<FakeClient>((r) => { resolveConnect = r; })),
        },
      },
    };

    const { unmount } = renderHook(() => useWorkspaceSaveEvent(vi.fn()));
    unmount();
    await act(async () => {
      resolveConnect!(client);
      await Promise.resolve();
    });

    // Nothing registered on a channel nobody is listening to, and the
    // connection is handed back rather than leaked.
    expect(client.register).not.toHaveBeenCalled();
    await waitFor(() => expect(client.disconnect).toHaveBeenCalledTimes(1));
  });

  it('swallows a failure while dropping a late connection', async () => {
    const client = makeClient();
    client.disconnect.mockRejectedValue(new Error('already gone'));
    let resolveConnect: ((c: FakeClient) => void) | null = null;
    (globalThis as any).fin = {
      InterApplicationBus: {
        Channel: {
          connect: vi.fn(() => new Promise<FakeClient>((r) => { resolveConnect = r; })),
        },
      },
    };

    const { unmount } = renderHook(() => useWorkspaceSaveEvent(vi.fn()));
    unmount();
    await act(async () => {
      resolveConnect!(client);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(client.register).not.toHaveBeenCalled();
  });

  it('warns when the disconnect on unmount fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = makeClient();
    client.disconnect.mockRejectedValue(new Error('port closed'));
    installFin(client);

    const { unmount } = renderHook(() => useWorkspaceSaveEvent(vi.fn()));
    await waitFor(() => expect(client.register).toHaveBeenCalled());
    unmount();

    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        '[useWorkspaceSaveEvent] disconnect failed:',
        expect.any(Error),
      ),
    );
  });

  it('does not let a throwing flush callback break the save', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = makeClient();
    installFin(client);
    renderHook(() => useWorkspaceSaveEvent(vi.fn().mockRejectedValue(new Error('save blew up'))));

    await waitFor(() => expect(client.handlers.has('workspace-saving')).toBe(true));
    // The platform awaits this; a rejection here would stall snapshot capture.
    await expect(client.handlers.get('workspace-saving')!({})).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      '[useWorkspaceSaveEvent] flush callback threw:',
      expect.any(Error),
    );
  });

  it('does not let a throwing onSaved listener escape', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = makeClient();
    installFin(client);
    renderHook(() =>
      useWorkspaceSaveEvent(vi.fn(), {
        onSaved: () => { throw new Error('listener blew up'); },
      }),
    );

    await waitFor(() => expect(client.handlers.has('workspace-saved')).toBe(true));
    expect(() => client.handlers.get('workspace-saved')!({ workspaceId: 'w' })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      '[useWorkspaceSaveEvent] onSaved listener threw:',
      expect.any(Error),
    );
  });

  it('reports an empty workspace id when the broadcast carried none', async () => {
    const client = makeClient();
    installFin(client);
    const onSaved = vi.fn();
    renderHook(() => useWorkspaceSaveEvent(vi.fn(), { onSaved }));

    await waitFor(() => expect(client.handlers.has('workspace-saved')).toBe(true));
    client.handlers.get('workspace-saved')!(undefined);
    expect(onSaved).toHaveBeenCalledWith('');
  });

  it('ignores a saved broadcast when no listener was supplied', async () => {
    const client = makeClient();
    installFin(client);
    renderHook(() => useWorkspaceSaveEvent(vi.fn()));

    await waitFor(() => expect(client.handlers.has('workspace-saved')).toBe(true));
    expect(() => client.handlers.get('workspace-saved')!({ workspaceId: 'w' })).not.toThrow();
  });

  it('ignores a save request once the callback has been withdrawn', async () => {
    const client = makeClient();
    installFin(client);
    const { rerender } = renderHook(
      ({ cb }: { cb: (() => void) | undefined }) => useWorkspaceSaveEvent(cb),
      { initialProps: { cb: vi.fn() as (() => void) | undefined } },
    );
    await waitFor(() => expect(client.handlers.has('workspace-saving')).toBe(true));

    rerender({ cb: undefined });
    await act(async () => { await Promise.resolve(); });

    await expect(client.handlers.get('workspace-saving')!({})).resolves.toBeUndefined();
  });
});

