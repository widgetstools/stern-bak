import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useProviderProbe } from './useProviderProbe.js';

vi.mock('@wellsfargo-starui/host-data', () => ({
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

vi.mock('@wellsfargo-starui/host-data/runtime', () => ({
  resolveCfg: vi.fn((cfg: unknown) => cfg),
}));

vi.mock('@wellsfargo-starui/host-data-react/runtime', () => ({
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
} from '@wellsfargo-starui/host-data';

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
});
