import { describe, expect, it, vi } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
import { fetchGridRows, type DataHubClient } from './dataAccess';

const ENTRY = { configId: 'grid-test', displayName: 'TestGrid' } as RegistryEntry;

function deps(opts: { providerId?: string | null; provider?: unknown } = {}) {
  const loadGridLevelData = vi.fn().mockResolvedValue(
    opts.providerId === null ? {} : { provider: { liveProviderId: opts.providerId ?? 'p1' } },
  );
  const get = vi.fn().mockResolvedValue(opts.provider ?? { providerId: 'p1', name: 'Positions Feed', providerType: 'mock' });
  return {
    configManager: { profiles: { loadGridLevelData } } as unknown as ConfigManager,
    configStore: { get } as unknown as DataProviderConfigStore,
  };
}

function hub(opts: { running: boolean; rows?: unknown[]; snapshot?: Promise<readonly unknown[]> }) {
  const unsubscribe = vi.fn();
  const client: DataHubClient = {
    isProviderRunning: vi.fn().mockResolvedValue(opts.running),
    subscribe: vi.fn().mockReturnValue({
      snapshot: opts.snapshot ?? Promise.resolve(opts.rows ?? []),
      unsubscribe,
    }),
  };
  return { client, unsubscribe };
}

describe('reading live rows', () => {
  it('returns the hub snapshot and marks it live', async () => {
    const { configManager, configStore } = deps();
    const { client } = hub({ running: true, rows: [{ ticker: 'AAPL' }, { ticker: 'MSFT' }] });

    const res = await fetchGridRows(configManager, configStore, ENTRY, client);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.source).toBe('live');
    expect(res.value.rows).toEqual([{ ticker: 'AAPL' }, { ticker: 'MSFT' }]);
    expect(res.value.provenance).toContain('on screen');
    expect(res.value.provenance).toContain('Positions Feed');
  });

  /** A read-only question must not leave a subscription holding the provider
   *  open after it answers. */
  it('always unsubscribes, including when the snapshot rejects', async () => {
    const { configManager, configStore } = deps();
    const ok = hub({ running: true, rows: [{ a: 1 }] });
    await fetchGridRows(configManager, configStore, ENTRY, ok.client);
    expect(ok.unsubscribe).toHaveBeenCalledTimes(1);

    const bad = hub({ running: true, snapshot: Promise.reject(new Error('hub exploded')) });
    const res = await fetchGridRows(configManager, configStore, ENTRY, bad.client);
    expect(bad.unsubscribe).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('hub exploded');
  });

  it('copies rows rather than handing back the hub cache itself', async () => {
    const cached = { ticker: 'AAPL' };
    const { configManager, configStore } = deps();
    const { client } = hub({ running: true, rows: [cached] });

    const res = await fetchGridRows(configManager, configStore, ENTRY, client);

    expect(res.ok === true && res.value.rows[0]).not.toBe(cached);
  });

  it('ignores non-object entries in a snapshot', async () => {
    const { configManager, configStore } = deps();
    const { client } = hub({ running: true, rows: [{ a: 1 }, null, 'nope', 42] });
    const res = await fetchGridRows(configManager, configStore, ENTRY, client);
    expect(res.ok === true && res.value.rows).toEqual([{ a: 1 }]);
  });
});

describe('when there is nothing live to read', () => {
  it('reports a grid with no provider bound', async () => {
    const { configManager, configStore } = deps({ providerId: null });
    const res = await fetchGridRows(configManager, configStore, ENTRY, hub({ running: true }).client);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('no data provider bound');
  });

  /**
   * Subscribing to a stopped provider would open a socket or fire an upstream
   * request as a side effect of a question — and still not return the rows the
   * user is looking at, because no window is showing any.
   */
  it('does not start a provider that is not running', async () => {
    const { configManager, configStore } = deps();
    const { client } = hub({ running: false });

    const res = await fetchGridRows(configManager, configStore, ENTRY, client);

    expect(client.subscribe).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('Open the blotter');
  });

  it('mentions the sample option only for a mock feed', async () => {
    const mock = deps();
    const mockRes = await fetchGridRows(mock.configManager, mock.configStore, ENTRY, hub({ running: false }).client);
    expect(mockRes.ok === false && mockRes.error).toContain('allowSample');

    const stomp = deps({ provider: { providerId: 'p1', name: 'Live STOMP', providerType: 'stomp' } });
    const stompRes = await fetchGridRows(stomp.configManager, stomp.configStore, ENTRY, hub({ running: false }).client);
    expect(stompRes.ok === false && stompRes.error).not.toContain('allowSample');
  });

  it('falls back to the mock generator only when asked', async () => {
    const { configManager, configStore } = deps();
    const { client } = hub({ running: false });

    const res = await fetchGridRows(configManager, configStore, ENTRY, client, { allowSample: true });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.source).toBe('sample');
    expect(res.value.rows.length).toBeGreaterThan(0);
  });

  /** Generated values are unseeded random. A summary of them describes numbers
   *  nobody has seen, so the wording has to make that unmissable. */
  it('labels a generated sample as not the user\'s data', async () => {
    const { configManager, configStore } = deps();
    const res = await fetchGridRows(configManager, configStore, ENTRY, hub({ running: false }).client, { allowSample: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.provenance).toContain('GENERATED');
    expect(res.value.provenance).toContain('NOT the numbers the user has on screen');
  });

  it('works with no hub client at all, the way a test or a bare window has none', async () => {
    const { configManager, configStore } = deps();
    const res = await fetchGridRows(configManager, configStore, ENTRY, undefined, { allowSample: true });
    expect(res.ok === true && res.value.source).toBe('sample');
  });
});
