/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { isInteropAvailable, useInteropChannel } from './useInteropChannel.js';

vi.mock('./useColorLinking.js', () => ({
  useColorLinking: () => ({ color: 'purple', linked: true }),
}));

function installInterop(overrides: Partial<{
  setContext: ReturnType<typeof vi.fn>;
  addContextHandler: ReturnType<typeof vi.fn>;
  joinContextGroup: ReturnType<typeof vi.fn>;
  removeFromContextGroup: ReturnType<typeof vi.fn>;
}> = {}) {
  const interop = {
    setContext: overrides.setContext ?? vi.fn().mockResolvedValue(undefined),
    addContextHandler:
      overrides.addContextHandler
      ?? vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    joinContextGroup: overrides.joinContextGroup ?? vi.fn().mockResolvedValue(undefined),
    removeFromContextGroup: overrides.removeFromContextGroup ?? vi.fn().mockResolvedValue(undefined),
  };
  (window as any).fin = { me: { interop } };
  return interop;
}

afterEach(() => {
  cleanup();
  delete (window as any).fin;
  vi.restoreAllMocks();
});

describe('isInteropAvailable', () => {
  it('reflects fin.me.interop presence', () => {
    expect(isInteropAvailable()).toBe(false);
    installInterop();
    expect(isInteropAvailable()).toBe(true);
  });
});

describe('useInteropChannel', () => {
  it('exposes linked color as current channel label', () => {
    installInterop();
    const { result } = renderHook(() => useInteropChannel());
    expect(result.current.current).toBe('purple');
  });

  it('forwards setContext on broadcast', async () => {
    const interop = installInterop();
    const { result } = renderHook(() => useInteropChannel());
    await act(async () => {
      await result.current.broadcast({ type: 'starui.gridSelection', criteria: {} });
    });
    expect(interop.setContext).toHaveBeenCalled();
  });

  it('swallows setContext failures unless debug is on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const interop = installInterop({
      setContext: vi.fn().mockRejectedValue(new Error('not linked')),
    });
    const { result } = renderHook(() => useInteropChannel());
    await act(async () => {
      await result.current.broadcast({ type: 'x' });
    });
    expect(interop.setContext).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns on addContextHandler failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installInterop({
      addContextHandler: vi.fn().mockRejectedValue(new Error('handler fail')),
    });
    const { result } = renderHook(() => useInteropChannel());
    act(() => {
      result.current.addContextListener('starui.gridSelection', vi.fn());
    });
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith('[useInteropChannel] addContextHandler failed:', expect.any(Error)),
    );
    warn.mockRestore();
  });

  it('joins and leaves context groups', async () => {
    const interop = installInterop();
    const { result } = renderHook(() => useInteropChannel());
    await act(async () => {
      await result.current.join('purple');
      await result.current.leave();
    });
    expect(interop.joinContextGroup).toHaveBeenCalledWith('purple');
    expect(interop.removeFromContextGroup).toHaveBeenCalled();
  });

  it('no-ops when interop is unavailable', async () => {
    const { result } = renderHook(() => useInteropChannel());
    await act(async () => {
      await result.current.broadcast({ type: 'x' });
      await result.current.join('purple');
      await result.current.leave();
    });
    const cleanup = result.current.addContextListener('x', vi.fn());
    expect(cleanup).toEqual(expect.any(Function));
    cleanup();
  });

  it('logs setContext failures when debug is enabled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    installInterop({
      setContext: vi.fn().mockRejectedValue(new Error('not linked')),
    });
    const { result } = renderHook(() => useInteropChannel({ debug: true }));
    await act(async () => {
      await result.current.broadcast({ type: 'x' });
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('unsubscribes async context handlers on cleanup', async () => {
    const unsubscribe = vi.fn();
    installInterop({
      addContextHandler: vi.fn().mockResolvedValue({ unsubscribe }),
    });
    const { result, unmount } = renderHook(() => useInteropChannel());
    let cleanup = () => {};
    act(() => {
      cleanup = result.current.addContextListener('starui.gridSelection', vi.fn());
    });
    await waitFor(() => expect(unsubscribe).not.toHaveBeenCalled());
    cleanup();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
