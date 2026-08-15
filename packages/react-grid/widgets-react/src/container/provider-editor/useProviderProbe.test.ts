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

// `readyImpl` is swappable so a test can simulate the hub never sending
// its `appdata-snapshot` (see the hang test at the bottom of this file).
const appData = vi.hoisted(() => ({ readyImpl: (): Promise<void> => Promise.resolve() }));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useAppDataStore: () => ({
    store: {
      ready: () => appData.readyImpl(),
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
  appData.readyImpl = () => Promise.resolve();
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

  // Regression: the editor's Test Connection button sat on "Connecting…"
  // forever. `test()` awaited `appDataStore.ready()` BEFORE dispatching the
  // probe, and `AppDataMirror.ready()` resolves only when the hub's
  // `appdata-snapshot` arrives — `attach()` is fire-and-forget with no
  // timeout, retry or reject path. A snapshot that never landed meant the
  // await never settled, so `connectStomp`'s own 10s timeout was never even
  // reached. Browser-confirmed: still spinning at 30s with no error.
  // AppData only supplies `{{name.key}}` token values here, so the wait is
  // best-effort and must be bounded.
  it('still completes the connection test when AppData never hydrates', async () => {
    vi.useFakeTimers();
    try {
      appData.readyImpl = () => new Promise<void>(() => {});
      vi.mocked(connectStomp).mockResolvedValue({ ok: true });

      const { result } = renderHook(() => useProviderProbe(stompCfg));
      // Kick off inside act() but don't await yet — the promise can only
      // settle once the bounded wait's timer fires below.
      const pending = act(async () => {
        await result.current.test();
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await pending;

      expect(connectStomp).toHaveBeenCalled();
      expect(result.current.testing).toBe(false);
      expect(result.current.testResult?.success).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still completes field inference when AppData never hydrates', async () => {
    vi.useFakeTimers();
    try {
      appData.readyImpl = () => new Promise<void>(() => {});
      vi.mocked(probeStomp).mockResolvedValue({ ok: true, rows: [{ id: 1 }] });

      const { result } = renderHook(() => useProviderProbe(stompCfg));
      const pending = act(async () => {
        await result.current.infer({ sampleSize: 5 });
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await pending;

      expect(probeStomp).toHaveBeenCalled();
      expect(result.current.inferring).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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
