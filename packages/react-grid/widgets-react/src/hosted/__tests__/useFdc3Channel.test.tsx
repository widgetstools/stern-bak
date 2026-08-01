/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, act, waitFor } from '@testing-library/react';
import { useFdc3Channel } from '../useFdc3Channel.js';

interface FakeFdc3 {
  getCurrentChannel: ReturnType<typeof vi.fn>;
  joinUserChannel: ReturnType<typeof vi.fn>;
  leaveCurrentChannel: ReturnType<typeof vi.fn>;
  broadcast: ReturnType<typeof vi.fn>;
  addContextListener: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  _userChannelHandler: (() => void) | null;
}

function installFdc3(initialChannel: { id: string } | null = null): FakeFdc3 {
  const fdc3: FakeFdc3 = {
    _userChannelHandler: null,
    getCurrentChannel: vi.fn().mockResolvedValue(initialChannel),
    joinUserChannel: vi.fn().mockResolvedValue(undefined),
    leaveCurrentChannel: vi.fn().mockResolvedValue(undefined),
    broadcast: vi.fn().mockResolvedValue(undefined),
    addContextListener: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    addEventListener: vi.fn((event: string, cb: () => void) => {
      if (event === 'userChannelChanged') fdc3._userChannelHandler = cb;
    }),
    removeEventListener: vi.fn((event: string) => {
      if (event === 'userChannelChanged') fdc3._userChannelHandler = null;
    }),
  };
  (window as any).fdc3 = fdc3;
  return fdc3;
}

afterEach(() => {
  cleanup();
  delete (window as any).fdc3;
  vi.restoreAllMocks();
});

describe('useFdc3Channel — FDC3 runtime', () => {
  it('reads initial current channel from getCurrentChannel()', async () => {
    const fdc3 = installFdc3({ id: 'red' });
    const { result } = renderHook(() => useFdc3Channel());
    await waitFor(() => expect(result.current.current).toBe('red'));
    expect(fdc3.getCurrentChannel).toHaveBeenCalled();
  });

  it('forwards joinUserChannel and refreshes current', async () => {
    const fdc3 = installFdc3(null);
    const { result } = renderHook(() => useFdc3Channel());
    await waitFor(() => expect(result.current.current).toBe(null));

    fdc3.getCurrentChannel.mockResolvedValueOnce({ id: 'blue' });
    await act(async () => {
      await result.current.join('blue');
    });
    expect(fdc3.joinUserChannel).toHaveBeenCalledWith('blue');
    expect(result.current.current).toBe('blue');
  });

  it('forwards leaveCurrentChannel and refreshes current', async () => {
    const fdc3 = installFdc3({ id: 'green' });
    const { result } = renderHook(() => useFdc3Channel());
    await waitFor(() => expect(result.current.current).toBe('green'));

    fdc3.getCurrentChannel.mockResolvedValueOnce(null);
    await act(async () => {
      await result.current.leave();
    });
    expect(fdc3.leaveCurrentChannel).toHaveBeenCalled();
    expect(result.current.current).toBe(null);
  });

  it('forwards broadcast', async () => {
    const fdc3 = installFdc3({ id: 'red' });
    const { result } = renderHook(() => useFdc3Channel());
    await waitFor(() => expect(result.current.current).toBe('red'));

    const ctx = { type: 'fdc3.instrument', id: { ticker: 'AAPL' } };
    await act(async () => {
      await result.current.broadcast(ctx);
    });
    expect(fdc3.broadcast).toHaveBeenCalledWith(ctx);
  });

  it('updates current when userChannelChanged fires', async () => {
    const fdc3 = installFdc3({ id: 'red' });
    const { result } = renderHook(() => useFdc3Channel());
    await waitFor(() => expect(fdc3._userChannelHandler).toBeTruthy());
    await waitFor(() => expect(result.current.current).toBe('red'));

    fdc3.getCurrentChannel.mockResolvedValueOnce({ id: 'yellow' });
    await act(async () => {
      fdc3._userChannelHandler!();
    });
    await waitFor(() => expect(result.current.current).toBe('yellow'));
  });

  it('addContextListener forwards args and unsubscribes on cleanup', async () => {
    const handle = { unsubscribe: vi.fn() };
    const fdc3 = installFdc3();
    fdc3.addContextListener.mockReturnValue(handle);

    const { result } = renderHook(() => useFdc3Channel());
    await waitFor(() => expect(result.current.current).toBe(null));

    const handler = vi.fn();
    let cleanupFn: (() => void) | null = null;
    await act(async () => {
      cleanupFn = result.current.addContextListener('fdc3.instrument', handler);
      // Allow the async listener registration to resolve
      await Promise.resolve();
    });
    expect(fdc3.addContextListener).toHaveBeenCalledWith('fdc3.instrument', handler);
    cleanupFn!();
    expect(handle.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('cleans up still-attached listeners on unmount', async () => {
    const handle = { unsubscribe: vi.fn() };
    const fdc3 = installFdc3();
    fdc3.addContextListener.mockReturnValue(handle);

    const { result, unmount } = renderHook(() => useFdc3Channel());
    await waitFor(() => expect(result.current.current).toBe(null));

    await act(async () => {
      result.current.addContextListener(null, vi.fn());
      await Promise.resolve();
    });
    unmount();
    expect(handle.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fdc3.removeEventListener).toHaveBeenCalledWith(
      'userChannelChanged',
      expect.any(Function),
    );
  });
});

describe('useFdc3Channel — non-FDC3 runtime', () => {
  it('returns null current and noop functions', async () => {
    const { result } = renderHook(() => useFdc3Channel());
    expect(result.current.current).toBe(null);

    // None of these should throw.
    await expect(result.current.join('red')).resolves.toBeUndefined();
    await expect(result.current.leave()).resolves.toBeUndefined();
    await expect(result.current.broadcast({ type: 'x' })).resolves.toBeUndefined();
    const cleanup = result.current.addContextListener(null, vi.fn());
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});
