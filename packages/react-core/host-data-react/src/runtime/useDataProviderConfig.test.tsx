import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ConfigManager } from '@wellsfargo-starui/host-config';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import { DataServicesProvider } from './DataServicesProvider.js';
import { useDataProviderConfig } from './index.js';

/**
 * Contract under test: switching providerId A → B must NOT keep A's
 * cfg visible with loading:false while B's fetch is in flight — that
 * window had consumers attaching provider B with provider A's cfg.
 * A catalog-change refresh for the SAME provider, by contrast, keeps
 * the current cfg visible while the fresh row loads.
 */

type Resolver = { resolve: (cfg: ProviderConfig) => void; reject: (e: Error) => void };

function makeHarness() {
  const pending = new Map<string, Resolver[]>();
  const catalogListeners = new Set<(d: { full?: boolean; providerId?: string }) => void>();

  const client = {
    onCatalogChange: vi.fn((cb: (d: { full?: boolean; providerId?: string }) => void) => {
      catalogListeners.add(cb);
      return () => catalogListeners.delete(cb);
    }),
    getProviderConfig: vi.fn(
      (id: string) =>
        new Promise<ProviderConfig>((resolve, reject) => {
          const list = pending.get(id) ?? [];
          list.push({ resolve, reject });
          pending.set(id, list);
        }),
    ),
  };

  const services: DataServices = {
    client: client as unknown as DataServices['client'],
    appData: {
      ready: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(() => () => undefined),
    } as unknown as DataServices['appData'],
    configManager: {} as unknown as ConfigManager,
    ready: Promise.resolve(),
    dispose: vi.fn(),
  };

  const resolveFetch = async (id: string, cfg: ProviderConfig) => {
    const list = pending.get(id) ?? [];
    pending.set(id, []);
    await act(async () => {
      for (const r of list) r.resolve(cfg);
    });
  };

  const emitCatalogChange = (providerId: string) => {
    act(() => {
      for (const cb of catalogListeners) cb({ providerId });
    });
  };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <DataServicesProvider services={services}>{children}</DataServicesProvider>
  );

  return { wrapper, resolveFetch, emitCatalogChange };
}

const cfgA = { providerType: 'stomp', url: 'ws://a' } as unknown as ProviderConfig;
const cfgB = { providerType: 'stomp', url: 'ws://b' } as unknown as ProviderConfig;

afterEach(() => cleanup());

describe('useDataProviderConfig — provider switch drops the stale cfg', () => {
  it('shows cfg:null + loading while the NEW provider fetch is in flight', async () => {
    const { wrapper, resolveFetch } = makeHarness();
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useDataProviderConfig(id),
      { wrapper, initialProps: { id: 'prov-a' } },
    );

    await resolveFetch('prov-a', cfgA);
    await waitFor(() => expect(result.current.cfg).toBe(cfgA));
    expect(result.current.loading).toBe(false);

    rerender({ id: 'prov-b' });
    // The switch window: A's cfg must be gone and loading must be on.
    expect(result.current.cfg).toBeNull();
    expect(result.current.loading).toBe(true);

    await resolveFetch('prov-b', cfgB);
    await waitFor(() => expect(result.current.cfg).toBe(cfgB));
    expect(result.current.loading).toBe(false);
  });

  it('keeps the current cfg visible through a same-provider catalog refresh', async () => {
    const { wrapper, resolveFetch, emitCatalogChange } = makeHarness();
    const { result } = renderHook(() => useDataProviderConfig('prov-a'), { wrapper });

    await resolveFetch('prov-a', cfgA);
    await waitFor(() => expect(result.current.cfg).toBe(cfgA));

    emitCatalogChange('prov-a');
    // Refresh in flight — old cfg stays visible, no loading flap.
    expect(result.current.cfg).toBe(cfgA);
    expect(result.current.loading).toBe(false);

    const cfgA2 = { ...cfgA, url: 'ws://a2' } as unknown as ProviderConfig;
    await resolveFetch('prov-a', cfgA2);
    await waitFor(() => expect(result.current.cfg).toBe(cfgA2));
  });
});
