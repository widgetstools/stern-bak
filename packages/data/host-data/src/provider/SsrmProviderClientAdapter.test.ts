/**
 * The adapter is a session holder: everything it forwards is keyed on the
 * subscription id `start()` obtained, and its interesting behaviour is what it
 * does when that id is missing — reject for the calls the datasource handles,
 * no-op for the calls nobody is waiting on.
 *
 * `ssrmAdapterLifecycle.test.ts` covers the fire-and-forget rule for
 * `setViewport` specifically; this file covers the rest of the surface.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ProviderStatus } from '../runtime/protocol.js';
import { SsrmProviderClientAdapter } from './SsrmProviderClientAdapter.js';

const CFG = { providerType: 'stomp-ssrm', columnDefinitions: [{ field: 'sym' }] } as never;

function makeHandle(subId = 'sub-1') {
  let resolveSnapshot!: (rows: readonly unknown[]) => void;
  let rejectSnapshot!: (err: unknown) => void;
  const snapshot = new Promise<readonly unknown[]>((res, rej) => {
    resolveSnapshot = res;
    rejectSnapshot = rej;
  });
  const cbs: {
    rows?: (n: number) => void;
    status?: (s: ProviderStatus, e?: string) => void;
  } = {};
  return {
    subId,
    snapshot,
    resolveSnapshot,
    rejectSnapshot,
    cbs,
    onUpdate: vi.fn(),
    onReset: vi.fn(),
    onSnapshotCommit: vi.fn(),
    onRowsReceived: vi.fn((cb: (n: number) => void) => {
      cbs.rows = cb;
    }),
    onStatus: vi.fn((cb: (s: ProviderStatus, e?: string) => void) => {
      cbs.status = cb;
    }),
    refresh: vi.fn().mockResolvedValue([]),
    unsubscribe: vi.fn(),
  };
}

type Handle = ReturnType<typeof makeHandle>;

function makeClient(handles: Handle[] = []) {
  let tickListener: ((ev: Record<string, unknown>) => void) | undefined;
  const offSsrmTick = vi.fn();
  let n = 0;
  return {
    tick: (ev: Record<string, unknown>) => tickListener?.(ev),
    offSsrmTick,
    subscribe: vi.fn(() => handles[n++] ?? makeHandle(`sub-${n}`)),
    getProviderConfig: vi.fn().mockResolvedValue({ config: CFG }),
    onSsrmTick: vi.fn((_subId: string, cb: (ev: Record<string, unknown>) => void) => {
      tickListener = cb;
      return offSsrmTick;
    }),
    ssrmGetRows: vi.fn().mockResolvedValue({ rows: [], lastRow: 0 }),
    ssrmSetViewport: vi.fn(),
    ssrmConfigureExpressions: vi.fn().mockResolvedValue(undefined),
    ssrmSetSessionPatches: vi.fn().mockResolvedValue(undefined),
    ssrmSetSessionExclude: vi.fn().mockResolvedValue(undefined),
    ssrmGetSetFilterValues: vi.fn().mockResolvedValue(['a']),
    ssrmGetStatusBar: vi.fn().mockResolvedValue({ total: 1, filtered: 1 }),
  };
}

type Client = ReturnType<typeof makeClient>;

/** `...rest` rather than a default, so passing `undefined` really means it. */
function adapterFor(client: Client, ...rest: [inlineCfg?: unknown]) {
  return new SsrmProviderClientAdapter({
    providerId: 'p1',
    client: client as never,
    inlineCfg: (rest.length ? rest[0] : CFG) as never,
  });
}

/** Start an adapter against a handle whose snapshot has already landed. */
async function started(client: Client, handle: Handle, ...rest: [inlineCfg?: unknown]) {
  const adapter = adapterFor(client, ...rest);
  handle.resolveSnapshot([]);
  await adapter.start();
  return adapter;
}

let handle: Handle;
let client: Client;

beforeEach(() => {
  handle = makeHandle();
  client = makeClient([handle]);
});

describe('start', () => {
  it('subscribes with the inline config without asking the catalog', async () => {
    await started(client, handle);

    expect(client.getProviderConfig).not.toHaveBeenCalled();
    expect(client.subscribe).toHaveBeenCalledWith('p1', CFG);
  });

  it('resolves the config from the catalog when none was inlined', async () => {
    const adapter = adapterFor(client, undefined);
    handle.resolveSnapshot([]);
    await adapter.start();

    expect(client.getProviderConfig).toHaveBeenCalledWith('p1');
    expect(adapter.getConfig()).toBe(CFG);
  });

  it('fails loudly when the catalog has no config to start from', async () => {
    client.getProviderConfig.mockResolvedValue(null);
    const adapter = adapterFor(client, undefined);

    await expect(adapter.start()).rejects.toThrow(/No config for providerId=p1/);
  });

  it('fails when the catalog row exists but carries no config', async () => {
    client.getProviderConfig.mockResolvedValue({ config: null });
    const adapter = adapterFor(client, undefined);

    await expect(adapter.start()).rejects.toThrow(/No config for providerId=p1/);
  });

  it('awaits the in-flight snapshot on a second start rather than returning early', async () => {
    const adapter = adapterFor(client, CFG);
    const first = adapter.start();
    const second = adapter.start();
    handle.resolveSnapshot([{ id: 1 }]);
    await Promise.all([first, second]);

    // One subscription, and the second caller waited for the same snapshot —
    // an early return here left callers thinking start() finished with no rows.
    expect(client.subscribe).toHaveBeenCalledTimes(1);
  });
});

describe('config and columns', () => {
  it('refuses getConfig before start', () => {
    expect(() => adapterFor(client).getConfig()).toThrow(/getConfig\(\) before start\(\)/);
  });

  it('answers null from getConfigOrNull before start', () => {
    expect(adapterFor(client).getConfigOrNull()).toBeNull();
  });

  it('has no column defs before start', () => {
    expect(adapterFor(client).getColumnDefs()).toEqual([]);
  });

  it('reports the config column definitions once started', async () => {
    const adapter = await started(client, handle);
    expect(adapter.getColumnDefs()).toEqual([{ field: 'sym' }]);
  });

  it('reports no columns when the config declares none', async () => {
    const adapter = await started(client, handle, { providerType: 'stomp-ssrm' });
    expect(adapter.getColumnDefs()).toEqual([]);
  });

  it('takes the provider type from the resolved config', async () => {
    const adapter = await started(client, handle);
    expect(adapter.capabilities.providerType).toBe('stomp-ssrm');
  });

  it('falls back to the inline provider type before start', () => {
    expect(adapterFor(client, { providerType: 'mock-ssrm' }).capabilities.providerType).toBe(
      'mock-ssrm',
    );
  });

  it('falls back to stomp-ssrm when nothing declares a type', () => {
    expect(adapterFor(client, undefined).capabilities.providerType).toBe('stomp-ssrm');
  });
});

describe('session-keyed calls', () => {
  it('routes getRows through the session id', async () => {
    const adapter = await started(client, handle);
    await adapter.getRows({ startRow: 0, endRow: 10 } as never);

    expect(client.ssrmGetRows).toHaveBeenCalledWith('p1', 'sub-1', { startRow: 0, endRow: 10 });
  });

  it('forwards the viewport with its interest scope', async () => {
    const adapter = await started(client, handle);
    await adapter.setViewport(['k1'], { mode: 'all' } as never);

    expect(client.ssrmSetViewport).toHaveBeenCalledWith('p1', 'sub-1', ['k1'], { mode: 'all' });
  });

  it('sends expression rules with the session id attached', async () => {
    const adapter = await started(client, handle);
    await adapter.configureExpressions([{ id: 'r1' } as never]);

    expect(client.ssrmConfigureExpressions).toHaveBeenCalledWith('p1', [{ id: 'r1' }], 'sub-1');
  });

  it('sends expression rules without a session before start', async () => {
    await adapterFor(client).configureExpressions([]);
    expect(client.ssrmConfigureExpressions).toHaveBeenCalledWith('p1', [], undefined);
  });

  it('forwards session patches as a fresh array', async () => {
    const adapter = await started(client, handle);
    const patches = [{ key: 'k1', fields: { qty: 5 } }];
    await adapter.setSessionPatches(patches);

    const sent = client.ssrmSetSessionPatches.mock.calls[0][2];
    expect(sent).toEqual(patches);
    // Copied, so a caller mutating its own list cannot rewrite what was sent.
    expect(sent).not.toBe(patches);
  });

  it('does not cross the worker boundary for an empty patch list', async () => {
    const adapter = await started(client, handle);
    await adapter.setSessionPatches([]);
    expect(client.ssrmSetSessionPatches).not.toHaveBeenCalled();
  });

  it('forwards a session exclusion, including its removal', async () => {
    const adapter = await started(client, handle);
    await adapter.setSessionExclude('qty > 10');
    await adapter.setSessionExclude(null);

    expect(client.ssrmSetSessionExclude).toHaveBeenNthCalledWith(1, 'p1', 'sub-1', 'qty > 10');
    expect(client.ssrmSetSessionExclude).toHaveBeenNthCalledWith(2, 'p1', 'sub-1', null);
  });

  it('asks for set-filter values scoped to this session', async () => {
    const adapter = await started(client, handle);
    await expect(adapter.getSetFilterValues({ field: 'sym' } as never)).resolves.toEqual(['a']);

    expect(client.ssrmGetSetFilterValues).toHaveBeenCalledWith('p1', { field: 'sym' }, 'sub-1');
  });

  it('asks for the status bar without a session — it is provider-wide', async () => {
    const adapter = await started(client, handle);
    await adapter.getStatusBar({ filterModel: {} } as never);

    expect(client.ssrmGetStatusBar).toHaveBeenCalledWith('p1', { filterModel: {} });
  });
});

describe('calls that must not reject after teardown', () => {
  it('swallows session patches once the session is gone', async () => {
    const adapter = await started(client, handle);
    await adapter.stop();

    await expect(adapter.setSessionPatches([{ key: 'k', fields: {} }])).resolves.toBeUndefined();
    expect(client.ssrmSetSessionPatches).not.toHaveBeenCalled();
  });

  it('swallows a session exclusion once the session is gone', async () => {
    const adapter = adapterFor(client);
    await expect(adapter.setSessionExclude('qty > 1')).resolves.toBeUndefined();
    expect(client.ssrmSetSessionExclude).not.toHaveBeenCalled();
  });

  it('rejects refresh before start, which the caller does await', async () => {
    await expect(adapterFor(client).refresh()).rejects.toThrow(/requires start\(\)/);
  });

  it('replays the hub cache on refresh once started', async () => {
    const adapter = await started(client, handle);
    await adapter.refresh();
    expect(handle.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('restart', () => {
  it('drops the old subscription and takes a new one', async () => {
    const second = makeHandle('sub-2');
    client = makeClient([handle, second]);
    const adapter = await started(client, handle);

    second.resolveSnapshot([]);
    await adapter.restart({ symbol: 'AAPL' });

    expect(handle.unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.subscribe).toHaveBeenLastCalledWith('p1', CFG, { extra: { symbol: 'AAPL' } });
  });

  it('passes no extras when the caller sends none', async () => {
    const second = makeHandle('sub-2');
    client = makeClient([handle, second]);
    const adapter = await started(client, handle);

    second.resolveSnapshot([]);
    await adapter.restart();

    expect(client.subscribe).toHaveBeenLastCalledWith('p1', CFG, {});
  });

  it('resolves a config first when restarting a never-started provider', async () => {
    const adapter = adapterFor(client, undefined);
    handle.resolveSnapshot([]);
    await adapter.restart();

    expect(client.getProviderConfig).toHaveBeenCalledWith('p1');
  });

  it('fails when a restart cannot find a config either', async () => {
    client.getProviderConfig.mockResolvedValue({});
    await expect(adapterFor(client, undefined).restart()).rejects.toThrow(/No config/);
  });
});

describe('event fan-out', () => {
  it('delivers ticks to every subscriber', async () => {
    const adapter = await started(client, handle);
    const seen: unknown[] = [];
    adapter.onSsrmTick((p) => seen.push(p));

    client.tick({ event: { kind: 'update' }, interestedKeys: ['k1'] });

    expect(seen).toEqual([{ event: { kind: 'update' }, interestedKeys: ['k1'] }]);
  });

  it('carries alerts on a tick only when the worker found some', async () => {
    const adapter = await started(client, handle);
    const seen: Array<Record<string, unknown>> = [];
    adapter.onSsrmTick((p) => seen.push(p as never));

    client.tick({ event: {}, interestedKeys: [], alerts: [] });
    client.tick({ event: {}, interestedKeys: [], alerts: [{ rowId: 'r1', ruleId: 'a1' }] });

    expect(seen[0]).not.toHaveProperty('alerts');
    expect(seen[1].alerts).toEqual([{ rowId: 'r1', ruleId: 'a1' }]);
  });

  it('stops delivering to an unsubscribed tick handler', async () => {
    const adapter = await started(client, handle);
    const seen: unknown[] = [];
    const off = adapter.onSsrmTick((p) => seen.push(p));
    off();

    client.tick({ event: {}, interestedKeys: [] });
    expect(seen).toEqual([]);
  });

  it('reports in-flight snapshot row counts', async () => {
    const adapter = await started(client, handle);
    const counts: number[] = [];
    const off = adapter.onRowsReceived((n) => counts.push(n));

    handle.cbs.rows?.(250);
    off();
    handle.cbs.rows?.(500);

    expect(counts).toEqual([250]);
  });

  it('reports status changes', async () => {
    const adapter = await started(client, handle);
    const seen: Array<[ProviderStatus, string | undefined]> = [];
    adapter.onStatus((s, e) => seen.push([s, e]));

    handle.cbs.status?.('ready');
    expect(seen).toEqual([['ready', undefined]]);
  });

  it('turns an error status into an error event as well', async () => {
    const adapter = await started(client, handle);
    const errors: string[] = [];
    adapter.onError((e) => errors.push(e.message));

    handle.cbs.status?.('error', 'socket closed');
    expect(errors).toEqual(['socket closed']);
  });

  it('names an error status that arrived without a message', async () => {
    const adapter = await started(client, handle);
    const errors: string[] = [];
    adapter.onError((e) => errors.push(e.message));

    handle.cbs.status?.('error');
    expect(errors).toEqual(['Provider error']);
  });

  it('stops delivering to an unsubscribed error handler', async () => {
    const adapter = await started(client, handle);
    const errors: string[] = [];
    const off = adapter.onError((e) => errors.push(e.message));
    off();

    handle.cbs.status?.('error', 'boom');
    expect(errors).toEqual([]);
  });

  it('reports a failed snapshot as an error', async () => {
    const adapter = adapterFor(client, CFG);
    const errors: string[] = [];
    adapter.onError((e) => errors.push(e.message));

    handle.rejectSnapshot(new Error('upstream refused'));
    await expect(adapter.start()).rejects.toThrow('upstream refused');
    expect(errors).toEqual(['upstream refused']);
  });

  it('wraps a non-Error snapshot rejection', async () => {
    const adapter = adapterFor(client, CFG);
    const errors: string[] = [];
    adapter.onError((e) => errors.push(e.message));

    handle.rejectSnapshot('plain string');
    await expect(adapter.start()).rejects.toBe('plain string');
    expect(errors).toEqual(['plain string']);
  });
});

describe('stop', () => {
  it('unsubscribes and releases the tick listener', async () => {
    const adapter = await started(client, handle);
    await adapter.stop();

    expect(handle.unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.offSsrmTick).toHaveBeenCalledTimes(1);
  });

  it('drops every handler, so a later tick reaches nobody', async () => {
    const adapter = await started(client, handle);
    const seen: unknown[] = [];
    adapter.onSsrmTick((p) => seen.push(p));
    adapter.onRowsReceived(() => seen.push('rows'));
    adapter.onStatus(() => seen.push('status'));
    adapter.onError(() => seen.push('error'));

    await adapter.stop();
    handle.cbs.rows?.(1);
    handle.cbs.status?.('error', 'late');

    expect(seen).toEqual([]);
  });

  it('is safe to stop a provider that never started', async () => {
    await expect(adapterFor(client).stop()).resolves.toBeUndefined();
  });
});
