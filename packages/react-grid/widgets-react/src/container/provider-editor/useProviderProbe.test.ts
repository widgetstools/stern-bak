import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useProviderProbe } from './useProviderProbe.js';

vi.mock('@wellsfargo-starui/data', () => ({
  probeStomp: vi.fn(),
  connectStomp: vi.fn(),
  probeRest: vi.fn(),
  probeMock: vi.fn(),
  inferFields: vi.fn(() => ({
    fields: [{ path: 'id', label: 'id', type: 'string' }],
    rowsFetched: 2,
    rowsUsed: 2,
  })),
}));

vi.mock('@wellsfargo-starui/data/runtime', () => ({
  resolveCfg: vi.fn((cfg: unknown) => cfg),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useAppDataStore: () => ({
    store: {
      ready: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
    },
  }),
}));

import {
  connectStomp,
  probeMock,
  probeRest,
  probeStomp,
} from '@wellsfargo-starui/data';

const stompCfg = {
  providerType: 'stomp' as const,
  websocketUrl: 'ws://localhost',
  listenerTopic: '/topic/a',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useProviderProbe', () => {
  it('returns idle state when cfg is null', async () => {
    const { result } = renderHook(() => useProviderProbe(null));
    await act(async () => {
      await result.current.test();
    });
    expect(result.current.testing).toBe(false);
    expect(result.current.testResult).toBeNull();
  });

  it('records stomp connect success without row count', async () => {
    vi.mocked(connectStomp).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useProviderProbe(stompCfg));
    await act(async () => {
      await result.current.test();
    });
    await waitFor(() => expect(result.current.testResult?.success).toBe(true));
    expect(result.current.testResult?.rowCount).toBeUndefined();
  });

  it('records probe failure from rest test', async () => {
    vi.mocked(probeRest).mockResolvedValue({ ok: false, error: '404' });
    const { result } = renderHook(() =>
      useProviderProbe({ providerType: 'rest', baseUrl: 'https://x', endpoint: '/a' }),
    );
    await act(async () => {
      await result.current.test();
    });
    await waitFor(() => expect(result.current.testResult).toEqual({ success: false, error: '404' }));
  });

  it('swallows thrown errors during test', async () => {
    vi.mocked(probeMock).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useProviderProbe({ providerType: 'mock', rowCount: 1, updateIntervalMs: 1, enableUpdates: false }),
    );
    await act(async () => {
      await result.current.test();
    });
    await waitFor(() =>
      expect(result.current.testResult).toEqual({ success: false, error: 'boom' }),
    );
  });

  it('infers fields after a successful probe', async () => {
    vi.mocked(probeStomp).mockResolvedValue({ ok: true, rows: [{ id: 1 }, { id: 2 }] });
    const { result } = renderHook(() => useProviderProbe(stompCfg));
    await act(async () => {
      await result.current.infer({ sampleSize: 10 });
    });
    await waitFor(() => expect(result.current.inferenceSummary?.fieldsDetected).toBe(1));
    expect(result.current.inferredFields).toHaveLength(1);
  });

  it('records inference probe failure', async () => {
    vi.mocked(probeRest).mockResolvedValue({ ok: false, error: 'timeout' });
    const { result } = renderHook(() =>
      useProviderProbe({ providerType: 'rest', baseUrl: 'https://x', endpoint: '/a' }),
    );
    await act(async () => {
      await result.current.infer();
    });
    await waitFor(() => expect(result.current.inferenceError).toBe('timeout'));
  });

  it('reset clears probe state', async () => {
    vi.mocked(connectStomp).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useProviderProbe(stompCfg));
    await act(async () => {
      await result.current.test();
    });
    await waitFor(() => expect(result.current.testResult?.success).toBe(true));
    act(() => {
      result.current.reset();
    });
    expect(result.current.testResult).toBeNull();
  });

  it('records mock probe success with row count', async () => {
    vi.mocked(probeMock).mockResolvedValue({ ok: true, rows: [{ id: 1 }, { id: 2 }] });
    const { result } = renderHook(() =>
      useProviderProbe({ providerType: 'mock', rowCount: 2, updateIntervalMs: 1, enableUpdates: false }),
    );
    await act(async () => {
      await result.current.test();
    });
    await waitFor(() => expect(result.current.testResult).toEqual({ success: true, rowCount: 2 }));
  });

  it('treats appdata transports as always reachable', async () => {
    const { result } = renderHook(() =>
      useProviderProbe({ providerType: 'appdata', variables: {} }),
    );
    await act(async () => {
      await result.current.test();
      await result.current.infer();
    });
    await waitFor(() => expect(result.current.testResult?.success).toBe(true));
    expect(result.current.inferenceSummary?.fieldsDetected).toBe(1);
  });

  it('records non-Error inference failures as strings', async () => {
    vi.mocked(probeRest).mockRejectedValue('timeout');
    const { result } = renderHook(() =>
      useProviderProbe({ providerType: 'rest', baseUrl: 'https://x', endpoint: '/a' }),
    );
    await act(async () => {
      await result.current.infer();
    });
    await waitFor(() => expect(result.current.inferenceError).toBe('timeout'));
  });

  it('aborts a stale test when a new one starts, keeping only the latest result', async () => {
    let resolveFirst: (r: { ok: boolean; error?: string }) => void = () => {};
    let resolveSecond: (r: { ok: boolean; error?: string }) => void = () => {};
    const first = new Promise<{ ok: boolean; error?: string }>((res) => { resolveFirst = res; });
    const second = new Promise<{ ok: boolean; error?: string }>((res) => { resolveSecond = res; });
    vi.mocked(connectStomp).mockImplementationOnce(() => first).mockImplementationOnce(() => second);

    const { result } = renderHook(() => useProviderProbe(stompCfg));

    act(() => { void result.current.test(); });
    await waitFor(() => expect(connectStomp).toHaveBeenCalledTimes(1));
    const signal1 = vi.mocked(connectStomp).mock.calls[0]?.[1]?.signal as AbortSignal;

    act(() => { void result.current.test(); });
    await waitFor(() => expect(connectStomp).toHaveBeenCalledTimes(2));

    // The first call's connection test is abandoned as soon as the second starts.
    expect(signal1.aborted).toBe(true);

    await act(async () => {
      resolveFirst({ ok: true }); // stale — must not land
      resolveSecond({ ok: false, error: 'nope' }); // current
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(result.current.testResult).toEqual({ success: false, error: 'nope' }),
    );
  });

  it('aborts the in-flight test on unmount instead of leaving it to idle out the timeout', async () => {
    let resolvePending: (r: { ok: boolean }) => void = () => {};
    const pending = new Promise<{ ok: boolean }>((res) => { resolvePending = res; });
    vi.mocked(connectStomp).mockImplementationOnce(() => pending);

    const { result, unmount } = renderHook(() => useProviderProbe(stompCfg));

    act(() => { void result.current.test(); });
    await waitFor(() => expect(connectStomp).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(connectStomp).mock.calls[0]?.[1]?.signal as AbortSignal;

    unmount();
    expect(signal.aborted).toBe(true);

    // Resolving after unmount must not throw or warn about a state
    // update on an unmounted component.
    await act(async () => {
      resolvePending({ ok: true });
      await Promise.resolve();
    });
  });

  it('reports unsupported provider types during test', async () => {
    const { result } = renderHook(() =>
      useProviderProbe({ providerType: 'websocket', url: 'ws://x' } as never),
    );
    await act(async () => {
      await result.current.test();
    });
    await waitFor(() =>
      expect(result.current.testResult).toEqual({
        success: false,
        error: 'Test not implemented for websocket',
      }),
    );
  });
});
