import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ConfigManager } from '@wellsfargo-starui/host-config';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import { DataServicesProvider } from './DataServicesProvider.js';
import { useResolvedCfg } from './index.js';

/**
 * Contract under test: the resolved cfg's identity must be stable
 * across AppData mutations that DON'T touch a key the cfg references.
 * The old shape re-ran resolveCfg on every AppData version bump, so
 * any provider writing any key minted a fresh cfg object and cascaded
 * a full provider detach/attach through every downstream consumer.
 */

function makeHarness(initial: Record<string, Record<string, unknown>>) {
  const data = new Map<string, Map<string, unknown>>();
  for (const [name, kv] of Object.entries(initial)) {
    data.set(name, new Map(Object.entries(kv)));
  }
  const subscribers = new Set<() => void>();

  const appData = {
    ready: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((cb: () => void) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    }),
    get: (name: string, key: string) => data.get(name)?.get(key),
    list: () => [],
  };

  const services: DataServices = {
    client: { __fake: true } as unknown as DataServices['client'],
    appData: appData as unknown as DataServices['appData'],
    configManager: {} as unknown as ConfigManager,
    ready: Promise.resolve(),
    dispose: vi.fn(),
  };

  const set = (name: string, key: string, value: unknown) => {
    let kv = data.get(name);
    if (!kv) {
      kv = new Map();
      data.set(name, kv);
    }
    kv.set(key, value);
    act(() => {
      for (const cb of subscribers) cb();
    });
  };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <DataServicesProvider services={services}>{children}</DataServicesProvider>
  );

  return { wrapper, set };
}

afterEach(() => cleanup());

describe('useResolvedCfg — identity stable unless a referenced key changes', () => {
  it('template-free cfg keeps its own identity through AppData churn', async () => {
    const { wrapper, set } = makeHarness({ ctx: { asOfDate: '2026-07-01' } });
    const cfg = { providerType: 'stomp', url: 'ws://x' } as unknown as ProviderConfig;

    const { result } = renderHook(() => useResolvedCfg(cfg), { wrapper });
    await waitFor(() => expect(result.current).toBe(cfg));

    set('ctx', 'asOfDate', '2026-07-02');
    expect(result.current).toBe(cfg);
  });

  it('unrelated AppData writes do not mint a new resolved cfg', async () => {
    const { wrapper, set } = makeHarness({
      ctx: { asOfDate: '2026-07-01', region: 'EMEA' },
    });
    const cfg = { providerType: 'stomp', trigger: 'date={{ctx.asOfDate}}' } as unknown as ProviderConfig;

    const { result } = renderHook(() => useResolvedCfg(cfg), { wrapper });
    await waitFor(() =>
      expect((result.current as { trigger?: string } | null)?.trigger).toBe('date=2026-07-01'),
    );
    const firstResolved = result.current;

    // A DIFFERENT key mutates → same resolved object, same identity.
    set('ctx', 'region', 'APAC');
    expect(result.current).toBe(firstResolved);

    // The REFERENCED key mutates → new identity, new value.
    set('ctx', 'asOfDate', '2026-07-15');
    await waitFor(() =>
      expect((result.current as { trigger?: string } | null)?.trigger).toBe('date=2026-07-15'),
    );
    expect(result.current).not.toBe(firstResolved);
  });
});
