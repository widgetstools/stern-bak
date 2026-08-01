import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ConfigManager } from '@wellsfargo-starui/host-config';
import type { DataServices, ProviderStats } from '@wellsfargo-starui/data/runtime';
import type { DataProviderConfig, ProviderConfig } from '@wellsfargo-starui/types';
import { DataServicesProvider } from './DataServicesProvider.js';
import {
  useAppData,
  useAppDataStore,
  useDataProviderConfig,
  useDataProvidersList,
  useDataServices,
  useProviderStats,
  useProviderStream,
} from './index.js';

/**
 * The hooks in `runtime/index.tsx` are the whole React surface over the
 * SharedWorker client. The client and the AppData mirror are the boundaries,
 * so the harness below is a controllable stand-in for both; everything that
 * runs is the real hook.
 *
 * `useResolvedCfg` and `useDataProviderConfig`'s provider-switch behaviour are
 * covered in their own files.
 */

interface Harness {
  wrapper: (props: { children: ReactNode }) => React.JSX.Element;
  appData: {
    rows: Array<{ configId: string; name: string; values: Record<string, unknown>; userId?: string; isPublic?: boolean; description?: string }>;
    set: ReturnType<typeof vi.fn>;
    upsertConfig: ReturnType<typeof vi.fn>;
    notify: () => void;
    resolveReady: () => void;
  };
  client: {
    attach: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    attachStats: ReturnType<typeof vi.fn>;
    listProviderConfigs: ReturnType<typeof vi.fn>;
    getProviderConfig: ReturnType<typeof vi.fn>;
    emitCatalogChange: (detail: { full?: boolean; providerId?: string }) => void;
    lastAttachListener: () => { onDelta: (rows: unknown[], replace: boolean) => void; onStatus: (s: string, err?: string) => void };
    lastStatsListener: () => { onStats: (stats: ProviderStats) => void };
  };
}

function makeHarness(opts: { readyImmediately?: boolean } = {}): Harness {
  const subscribers = new Set<() => void>();
  const rows: Harness['appData']['rows'] = [];
  let resolveReady!: () => void;
  const readyPromise = opts.readyImmediately === false
    ? new Promise<void>((resolve) => { resolveReady = resolve; })
    : Promise.resolve();

  const appData = {
    rows,
    ready: () => readyPromise,
    subscribe: (cb: () => void) => { subscribers.add(cb); return () => subscribers.delete(cb); },
    get: (name: string, key: string) => rows.find((r) => r.name === name)?.values[key],
    list: () => rows,
    set: vi.fn().mockResolvedValue(undefined),
    upsertConfig: vi.fn().mockResolvedValue(undefined),
    notify: () => { act(() => { for (const cb of subscribers) cb(); }); },
    resolveReady: () => resolveReady?.(),
  };

  const catalogListeners = new Set<(d: { full?: boolean; providerId?: string }) => void>();
  const attachListeners: Array<{ onDelta: (rows: unknown[], replace: boolean) => void; onStatus: (s: string, err?: string) => void }> = [];
  const statsListeners: Array<{ onStats: (stats: ProviderStats) => void }> = [];
  let subCounter = 0;

  const client = {
    onCatalogChange: vi.fn((cb: (d: { full?: boolean; providerId?: string }) => void) => {
      catalogListeners.add(cb);
      return () => catalogListeners.delete(cb);
    }),
    attach: vi.fn((_id: string, _cfg: unknown, listener: (typeof attachListeners)[number]) => {
      attachListeners.push(listener);
      return `sub-${++subCounter}`;
    }),
    detach: vi.fn(),
    attachStats: vi.fn((_id: string, listener: (typeof statsListeners)[number]) => {
      statsListeners.push(listener);
      return `stats-${++subCounter}`;
    }),
    listProviderConfigs: vi.fn().mockResolvedValue([]),
    getProviderConfig: vi.fn().mockResolvedValue(null),
    invalidateConfig: vi.fn(),
    emitCatalogChange: (detail: { full?: boolean; providerId?: string }) => {
      act(() => { for (const cb of catalogListeners) cb(detail); });
    },
    lastAttachListener: () => attachListeners[attachListeners.length - 1],
    lastStatsListener: () => statsListeners[statsListeners.length - 1],
  };

  const services: DataServices = {
    client: client as unknown as DataServices['client'],
    appData: appData as unknown as DataServices['appData'],
    configManager: { getAppId: () => 'star-demo' } as unknown as ConfigManager,
    ready: Promise.resolve(),
    dispose: vi.fn(),
  };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <DataServicesProvider services={services} userId="k123">{children}</DataServicesProvider>
  );

  return { wrapper, appData, client } as Harness;
}

afterEach(() => cleanup());

describe('useDataServices', () => {
  it('hands back the raw client and stores', () => {
    const { wrapper, client } = makeHarness();
    const { result } = renderHook(() => useDataServices(), { wrapper });

    expect(result.current.client).toBe(client);
    expect(result.current.configStore).toBeDefined();
  });
});

describe('useAppDataStore', () => {
  it('reports loaded only once the mirror has hydrated', async () => {
    const h = makeHarness({ readyImmediately: false });
    const { result } = renderHook(() => useAppDataStore(), { wrapper: h.wrapper });

    expect(result.current.loaded).toBe(false);

    await act(async () => { h.appData.resolveReady(); await Promise.resolve(); });
    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it('bumps the version on every AppData mutation', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useAppDataStore(), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const before = result.current.version;
    h.appData.notify();
    expect(result.current.version).toBe(before + 1);
  });

  it('unsubscribes on unmount', async () => {
    const h = makeHarness();
    const { result, unmount } = renderHook(() => useAppDataStore(), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    unmount();
    // A leaked subscription re-renders an unmounted tree on every hub tick.
    expect(() => h.appData.notify()).not.toThrow();
  });
});

describe('useAppData', () => {
  it('is empty for a provider name the mirror has never seen', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useAppData('positions'), { wrapper: h.wrapper });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.values).toEqual({});
    expect(result.current.get('asOfDate')).toBeUndefined();
  });

  it('exposes a copy of the named provider’s values, refreshed on mutation', async () => {
    const h = makeHarness();
    h.appData.rows.push({ configId: 'ad-1', name: 'positions', values: { asOfDate: '2026-07-01' } });

    const { result } = renderHook(() => useAppData('positions'), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.values).toEqual({ asOfDate: '2026-07-01' }));

    // A copy, not the live row: mutating what a consumer got back must not
    // reach into the mirror.
    result.current.values.asOfDate = 'tampered';
    expect(h.appData.rows[0].values.asOfDate).toBe('2026-07-01');

    h.appData.rows[0].values.asOfDate = '2026-07-02';
    h.appData.notify();
    await waitFor(() => expect(result.current.values).toEqual({ asOfDate: '2026-07-02' }));
  });

  it('set() writes a single key through the store', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useAppData('positions'), { wrapper: h.wrapper });

    await act(async () => { await result.current.set('asOfDate', '2026-04-30'); });
    expect(h.appData.set).toHaveBeenCalledWith('positions', 'asOfDate', '2026-04-30');
  });

  it('setMany() on a fresh provider owns the row with the session user', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useAppData('positions'), { wrapper: h.wrapper });

    await act(async () => { await result.current.setMany({ asOfDate: '2026-04-30' }); });

    // userId must not land as '' — that row would then belong to nobody and
    // never come back from a user-scoped list().
    expect(h.appData.upsertConfig).toHaveBeenCalledWith({
      configId: '',
      name: 'positions',
      description: undefined,
      isPublic: false,
      values: { asOfDate: '2026-04-30' },
      userId: 'k123',
    });
  });

  it('setMany() preserves a public row’s owner and configId', async () => {
    const h = makeHarness();
    h.appData.rows.push({
      configId: 'ad-9',
      name: 'positions',
      values: { asOfDate: '2026-07-01' },
      userId: 'system',
      isPublic: true,
      description: 'shared',
    });

    const { result } = renderHook(() => useAppData('positions'), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.values).toEqual({ asOfDate: '2026-07-01' }));

    await act(async () => { await result.current.setMany({ asOfDate: '2026-08-01' }); });

    expect(h.appData.upsertConfig).toHaveBeenCalledWith({
      configId: 'ad-9',
      name: 'positions',
      description: 'shared',
      isPublic: true,
      values: { asOfDate: '2026-08-01' },
      userId: 'system',
    });
  });
});

describe('useDataProviderConfig', () => {
  it('reports no config and no loading when the provider id is null', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useDataProviderConfig(null), { wrapper: h.wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.cfg).toBeNull();
    expect(h.client.getProviderConfig).not.toHaveBeenCalled();
  });

  it('surfaces a fetch failure while keeping the previous cfg', async () => {
    const h = makeHarness();
    const cfg = { providerType: 'stomp' } as unknown as DataProviderConfig;
    h.client.getProviderConfig.mockResolvedValueOnce(cfg);

    const { result } = renderHook(() => useDataProviderConfig('prov-a'), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.cfg).toBe(cfg));

    h.client.getProviderConfig.mockRejectedValueOnce(new Error('worker gone'));
    h.client.emitCatalogChange({ providerId: 'prov-a' });

    await waitFor(() => expect(result.current.error).toBe('worker gone'));
    // The stale-but-known cfg beats blanking the editor on a transient error.
    expect(result.current.cfg).toBe(cfg);
  });

  it('re-fetches on a full catalog change', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useDataProviderConfig('prov-a'), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const calls = h.client.getProviderConfig.mock.calls.length;

    h.client.emitCatalogChange({ full: true });
    await waitFor(() => expect(h.client.getProviderConfig.mock.calls.length).toBe(calls + 1));
  });

  it('ignores a catalog change for a different provider', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useDataProviderConfig('prov-a'), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const calls = h.client.getProviderConfig.mock.calls.length;

    h.client.emitCatalogChange({ providerId: 'prov-other' });
    expect(h.client.getProviderConfig.mock.calls.length).toBe(calls);
  });
});

describe('useDataProvidersList', () => {
  const rows = [{ configId: 'p1' }, { configId: 'p2' }] as unknown as DataProviderConfig[];

  it('loads the catalog on mount', async () => {
    const h = makeHarness();
    h.client.listProviderConfigs.mockResolvedValue(rows);

    const { result } = renderHook(() => useDataProvidersList(), { wrapper: h.wrapper });

    await waitFor(() => expect(result.current.configs).toEqual(rows));
    expect(result.current.loading).toBe(false);
    expect(h.client.listProviderConfigs).toHaveBeenCalledWith({});
  });

  it('forwards subtype and includeAppData as list options', async () => {
    const h = makeHarness();
    renderHook(
      () => useDataProvidersList({ subtype: 'stomp' as ProviderConfig['providerType'], includeAppData: true }),
      { wrapper: h.wrapper },
    );

    await waitFor(() =>
      expect(h.client.listProviderConfigs).toHaveBeenCalledWith({ subtype: 'stomp', includeAppData: true }),
    );
  });

  it('reports the failure and clears the list', async () => {
    const h = makeHarness();
    h.client.listProviderConfigs.mockRejectedValue(new Error('catalog unavailable'));

    const { result } = renderHook(() => useDataProvidersList(), { wrapper: h.wrapper });

    await waitFor(() => expect(result.current.error).toBe('catalog unavailable'));
    expect(result.current.configs).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('refresh() re-pulls without re-mounting the picker', async () => {
    const h = makeHarness();
    h.client.listProviderConfigs.mockResolvedValue(rows);
    const { result } = renderHook(() => useDataProvidersList(), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.configs).toEqual(rows));

    act(() => { result.current.refresh(); });
    await waitFor(() => expect(h.client.listProviderConfigs).toHaveBeenCalledTimes(2));
  });

  it('a catalog change re-pulls the list', async () => {
    const h = makeHarness();
    h.client.listProviderConfigs.mockResolvedValue(rows);
    const { result } = renderHook(() => useDataProvidersList(), { wrapper: h.wrapper });
    await waitFor(() => expect(result.current.configs).toEqual(rows));

    h.client.emitCatalogChange({ providerId: 'p1' });
    await waitFor(() => expect(h.client.listProviderConfigs).toHaveBeenCalledTimes(2));
  });
});

describe('useProviderStream', () => {
  const cfg = { providerType: 'stomp' } as unknown as ProviderConfig;
  const listener = () => ({ onDelta: vi.fn(), onStatus: vi.fn() });

  it('stays in loading and never attaches without a providerId or cfg', () => {
    const h = makeHarness();
    const { result } = renderHook(() => useProviderStream(null, cfg, listener()), { wrapper: h.wrapper });

    expect(result.current.status).toBe('loading');
    expect(h.client.attach).not.toHaveBeenCalled();
  });

  it('attaches, forwards deltas and status, and detaches on unmount', async () => {
    const h = makeHarness();
    const l = listener();
    const { result, unmount } = renderHook(() => useProviderStream('prov-a', cfg, l), { wrapper: h.wrapper });

    expect(h.client.attach).toHaveBeenCalledWith('prov-a', cfg, expect.any(Object));

    act(() => { h.client.lastAttachListener().onDelta([{ id: 1 }], true); });
    expect(l.onDelta).toHaveBeenCalledWith([{ id: 1 }], true);

    act(() => { h.client.lastAttachListener().onStatus('ready'); });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(l.onStatus).toHaveBeenCalledWith('ready', undefined);

    unmount();
    expect(h.client.detach).toHaveBeenCalledWith('sub-1');
  });

  it('surfaces the error text the hub reported with an error status', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useProviderStream('prov-a', cfg, listener()), { wrapper: h.wrapper });

    act(() => { h.client.lastAttachListener().onStatus('error', 'upstream 500'); });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('upstream 500');
  });

  it('uses the latest listener without re-attaching', async () => {
    const h = makeHarness();
    const first = listener();
    const second = listener();
    const { rerender } = renderHook(
      ({ l }: { l: ReturnType<typeof listener> }) => useProviderStream('prov-a', cfg, l),
      { wrapper: h.wrapper, initialProps: { l: first } },
    );

    rerender({ l: second });
    act(() => { h.client.lastAttachListener().onDelta([{ id: 2 }], false); });

    // Re-attaching on every render would restart the provider each time a
    // caller passed an inline closure.
    expect(h.client.attach).toHaveBeenCalledTimes(1);
    expect(first.onDelta).not.toHaveBeenCalled();
    expect(second.onDelta).toHaveBeenCalledWith([{ id: 2 }], false);
  });

  it('refresh() sends a cfg-free attach carrying the extra payload', () => {
    const h = makeHarness();
    const { result } = renderHook(() => useProviderStream('prov-a', cfg, listener()), { wrapper: h.wrapper });

    act(() => { result.current.refresh({ asOfDate: '2026-07-01' }); });

    expect(h.client.attach).toHaveBeenLastCalledWith(
      'prov-a',
      undefined,
      expect.any(Object),
      { extra: { asOfDate: '2026-07-01' } },
    );
  });

  it('refresh() with no extra still forces a restart', () => {
    const h = makeHarness();
    const { result } = renderHook(() => useProviderStream('prov-a', cfg, listener()), { wrapper: h.wrapper });

    act(() => { result.current.refresh(); });

    const [, , , opts] = h.client.attach.mock.calls[h.client.attach.mock.calls.length - 1];
    expect(Object.keys((opts as { extra: Record<string, unknown> }).extra)).toEqual(['__refresh']);
  });

  it('refresh() is a no-op without a providerId', () => {
    const h = makeHarness();
    const { result } = renderHook(() => useProviderStream(null, cfg, listener()), { wrapper: h.wrapper });

    act(() => { result.current.refresh(); });
    expect(h.client.attach).not.toHaveBeenCalled();
  });
});

describe('useProviderStats', () => {
  it('does not subscribe without a providerId', () => {
    const h = makeHarness();
    renderHook(() => useProviderStats(null, { onStats: vi.fn() }), { wrapper: h.wrapper });

    expect(h.client.attachStats).not.toHaveBeenCalled();
  });

  it('forwards stats and detaches on unmount', () => {
    const h = makeHarness();
    const onStats = vi.fn();
    const { unmount } = renderHook(() => useProviderStats('prov-a', { onStats }), { wrapper: h.wrapper });

    const stats = { rowCount: 12 } as unknown as ProviderStats;
    act(() => { h.client.lastStatsListener().onStats(stats); });
    expect(onStats).toHaveBeenCalledWith(stats);

    unmount();
    expect(h.client.detach).toHaveBeenCalledWith('stats-1');
  });

  it('uses the latest stats listener without re-subscribing', () => {
    const h = makeHarness();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onStats }: { onStats: (s: ProviderStats) => void }) => useProviderStats('prov-a', { onStats }),
      { wrapper: h.wrapper, initialProps: { onStats: first } },
    );

    rerender({ onStats: second });
    act(() => { h.client.lastStatsListener().onStats({ rowCount: 1 } as unknown as ProviderStats); });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
