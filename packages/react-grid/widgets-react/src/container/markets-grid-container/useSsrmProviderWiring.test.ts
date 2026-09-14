import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';
import { useSsrmProviderWiring } from './useSsrmProviderWiring.js';

function makeProvider() {
  const statuses = new Set<(status: ProviderStatus, error?: string) => void>();
  const errors = new Set<(error: Error) => void>();
  const rows = new Set<(count: number) => void>();
  const provider = {
    id: 'p-ssrm',
    capabilities: {
      providerType: 'stomp-ssrm',
      streaming: true,
      realtime: true,
      supportsRefresh: true,
      supportsRestart: true,
    },
    start: vi.fn(),
    stop: vi.fn(),
    refresh: vi.fn(),
    restart: vi.fn(),
    getConfig: vi.fn(),
    getColumnDefs: vi.fn(() => []),
    getRows: vi.fn(),
    getColumnValues: vi.fn(() => Promise.resolve({ column: 'c', values: [], truncated: false })),
  getRowCount: vi.fn(() => Promise.resolve({ rowCount: 0 })),
  getAggregates: vi.fn(() => Promise.resolve({ values: {} })),
    watchGroups: vi.fn(),
    onSsrmTick: vi.fn(() => () => undefined),
    onRefresh: vi.fn(() => () => undefined),
    onRowsReceived: vi.fn((h: (count: number) => void) => {
      rows.add(h);
      return () => { rows.delete(h); };
    }),
    onStatus: vi.fn((h: (status: ProviderStatus, error?: string) => void) => {
      statuses.add(h);
      return () => { statuses.delete(h); };
    }),
    onError: vi.fn((h: (error: Error) => void) => {
      errors.add(h);
      return () => { errors.delete(h); };
    }),
  } as unknown as ISsrmDataProvider;

  return {
    provider,
    emitStatus(status: ProviderStatus, error?: string) {
      for (const h of statuses) h(status, error);
    },
    emitError(err: Error) {
      for (const h of errors) h(err);
    },
    emitRows(count: number) {
      for (const h of rows) h(count);
    },
  };
}

function setters() {
  return {
    setLoadRowCount: vi.fn(),
    setProviderDisconnected: vi.fn(),
    setDisconnectDetail: vi.fn(),
    setResolvedSubKey: vi.fn(),
    setIsRefetching: vi.fn(),
  };
}

function bus() {
  return { emit: vi.fn(), on: vi.fn(() => () => undefined) } as never;
}

describe('useSsrmProviderWiring', () => {
  it('does nothing without a provider', () => {
    const s = setters();
    renderHook(() => useSsrmProviderWiring({
      provider: null,
      activeId: 'p-ssrm',
      subscriptionKey: 'k',
      mode: 'live',
      containerEventBus: bus(),
      ...s,
    }));
    expect(s.setProviderDisconnected).not.toHaveBeenCalled();
  });

  it('clears the overlay and the stale banner when the provider is ready', () => {
    const p = makeProvider();
    const s = setters();
    const eventBus = bus();
    renderHook(() => useSsrmProviderWiring({
      provider: p.provider,
      activeId: 'p-ssrm',
      subscriptionKey: 'k',
      mode: 'live',
      containerEventBus: eventBus,
      ...s,
    }));

    p.emitStatus('ready');
    expect(s.setProviderDisconnected).toHaveBeenLastCalledWith(false);
    expect(s.setIsRefetching).toHaveBeenLastCalledWith(false);
    expect(s.setResolvedSubKey).toHaveBeenCalledWith('k');
    expect(eventBus.emit).toHaveBeenCalledWith('provider:status', {
      status: 'ready',
      error: undefined,
      providerId: 'p-ssrm',
      mode: 'live',
    });
  });

  it('holds the overlay open while loading', () => {
    const p = makeProvider();
    const s = setters();
    renderHook(() => useSsrmProviderWiring({
      provider: p.provider,
      activeId: 'p-ssrm',
      subscriptionKey: 'k',
      mode: 'live',
      containerEventBus: bus(),
      ...s,
    }));

    p.emitStatus('loading');
    expect(s.setIsRefetching).toHaveBeenLastCalledWith(true);
    expect(s.setResolvedSubKey).not.toHaveBeenCalled();
  });

  it('raises the stale banner and reports the error on a failed status', () => {
    const p = makeProvider();
    const s = setters();
    const onError = vi.fn();
    renderHook(() => useSsrmProviderWiring({
      provider: p.provider,
      activeId: 'p-ssrm',
      subscriptionKey: null,
      mode: 'live',
      onError,
      containerEventBus: bus(),
      ...s,
    }));

    p.emitStatus('error', 'socket closed');
    expect(s.setProviderDisconnected).toHaveBeenLastCalledWith(true);
    expect(s.setDisconnectDetail).toHaveBeenLastCalledWith('socket closed');
    expect(onError).toHaveBeenCalledWith(new Error('socket closed'));
    // No subscriptionKey → falls back to the provider id.
    expect(s.setResolvedSubKey).toHaveBeenCalledWith('p-ssrm');
  });

  it('forwards progressive snapshot counts and provider errors', () => {
    const p = makeProvider();
    const s = setters();
    const onError = vi.fn();
    renderHook(() => useSsrmProviderWiring({
      provider: p.provider,
      activeId: 'p-ssrm',
      subscriptionKey: 'k',
      mode: 'live',
      onError,
      containerEventBus: bus(),
      ...s,
    }));

    p.emitRows(4200);
    expect(s.setLoadRowCount).toHaveBeenLastCalledWith(4200);

    const err = new Error('boom');
    p.emitError(err);
    expect(onError).toHaveBeenCalledWith(err);
    expect(s.setIsRefetching).toHaveBeenLastCalledWith(false);
  });

  it('stops updating after unmount', () => {
    const p = makeProvider();
    const s = setters();
    const { unmount } = renderHook(() => useSsrmProviderWiring({
      provider: p.provider,
      activeId: 'p-ssrm',
      subscriptionKey: 'k',
      mode: 'live',
      containerEventBus: bus(),
      ...s,
    }));

    unmount();
    s.setLoadRowCount.mockClear();
    p.emitRows(1);
    expect(s.setLoadRowCount).not.toHaveBeenCalled();
  });
});
