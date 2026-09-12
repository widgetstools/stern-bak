/**
 * Catalog RPC handlers, driven directly against a fake
 * {@link CatalogRpcContext}.
 *
 * Every handler answers on the SAME `reqId` the client sent — a reply
 * that loses it strands the caller's pending promise forever. The two
 * degraded paths matter just as much as the happy ones:
 *
 *   • a hub built without a ConfigManager has `catalog === null`, and
 *     must answer `ok: false` rather than throwing into the port's
 *     message handler (which would drop the reply entirely);
 *   • a rejected catalog read is converted to `ok: false` + a message.
 */

import { describe, expect, it, vi } from 'vitest';
import { OptimisticLockError, type AppConfigRow, type ConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  handleConfigDelete,
  handleConfigInvalidate,
  handleConfigSave,
  handleGetConfig,
  handleHubIntrospect,
  handleHubReady,
  handleListConfigs,
  handleProviderRunning,
  type CatalogRpcContext,
} from './hubCatalogRpc.js';
import type { ConfigSnapshotEvent, HubIntrospectSnapshot } from '../protocol.js';
import type { PortLike } from './hubTypes.js';

function fakePort() {
  const sent: ConfigSnapshotEvent[] = [];
  const port = { postMessage: (m: unknown) => { sent.push(m as ConfigSnapshotEvent); } } as PortLike;
  return { port, sent, last: () => sent[sent.length - 1] };
}

const INTROSPECT = { providers: [], ports: 0 } as unknown as HubIntrospectSnapshot;

function fakeCtx(overrides: Partial<CatalogRpcContext> = {}): CatalogRpcContext {
  return {
    catalog: null,
    configManager: null,
    ownWrites: new Set<string>(),
    broadcastCatalogEvent: vi.fn(),
    resyncAppData: vi.fn(async () => {}),
    buildIntrospect: () => INTROSPECT,
    isProviderRunning: () => false,
    ...overrides,
  };
}

function fakeCatalog(overrides: Record<string, unknown> = {}) {
  return {
    isReady: () => true,
    ensure: vi.fn(async () => ({ providerId: 'p1' })),
    list: vi.fn(() => [{ providerId: 'p1' }]),
    invalidate: vi.fn(async () => {}),
    ...overrides,
  } as unknown as CatalogRpcContext['catalog'];
}

const NO_CATALOG_ERROR = 'Config catalog not available in this hub instance';

describe('handleHubReady', () => {
  it('reports the catalog readiness on the request reqId', () => {
    const { port, last } = fakePort();
    handleHubReady(fakeCtx({ catalog: fakeCatalog() }), port, { kind: 'hub-ready', reqId: 'r1' });
    expect(last()).toEqual({ kind: 'config-snapshot', reqId: 'r1', ok: true, ready: true });
  });

  it('answers ready:false — not an error — when there is no catalog at all', () => {
    // `hub-ready` is the client's liveness probe; failing it would make
    // a catalog-less hub look dead rather than merely un-preloaded.
    const { port, last } = fakePort();
    handleHubReady(fakeCtx(), port, { kind: 'hub-ready', reqId: 'r1' });
    expect(last()).toMatchObject({ ok: true, ready: false });
  });

  it('answers ready:false while the catalog is still loading', () => {
    const { port, last } = fakePort();
    handleHubReady(
      fakeCtx({ catalog: fakeCatalog({ isReady: () => false }) }),
      port,
      { kind: 'hub-ready', reqId: 'r1' },
    );
    expect(last()).toMatchObject({ ok: true, ready: false });
  });
});

describe('handleHubIntrospect', () => {
  it('returns the built snapshot', () => {
    const { port, last } = fakePort();
    handleHubIntrospect(fakeCtx(), port, { kind: 'hub-introspect', reqId: 'r2' });
    expect(last()).toEqual({
      kind: 'config-snapshot',
      reqId: 'r2',
      ok: true,
      introspect: INTROSPECT,
    });
  });
});

describe('handleProviderRunning', () => {
  it('probes the requested provider id', () => {
    const isProviderRunning = vi.fn((id: string) => id === 'live');
    const { port, last } = fakePort();

    handleProviderRunning(
      fakeCtx({ isProviderRunning }),
      port,
      { kind: 'provider-running', reqId: 'r3', providerId: 'live' },
    );

    expect(isProviderRunning).toHaveBeenCalledWith('live');
    expect(last()).toMatchObject({ ok: true, running: true });
  });

  it('reports false for a provider that is not running', () => {
    const { port, last } = fakePort();
    handleProviderRunning(
      fakeCtx(),
      port,
      { kind: 'provider-running', reqId: 'r3', providerId: 'idle' },
    );
    expect(last()).toMatchObject({ ok: true, running: false });
  });
});

describe('handleGetConfig', () => {
  it('resolves one provider on demand and replies with it', async () => {
    const catalog = fakeCatalog();
    const { port, last } = fakePort();

    await handleGetConfig(
      fakeCtx({ catalog }),
      port,
      { kind: 'get-config', reqId: 'r4', providerId: 'p1' },
    );

    expect(catalog!.ensure).toHaveBeenCalledWith('p1');
    expect(last()).toMatchObject({ ok: true, config: { providerId: 'p1' } });
  });

  it('replies ok:false when the hub has no catalog', async () => {
    const { port, last } = fakePort();
    await handleGetConfig(fakeCtx(), port, { kind: 'get-config', reqId: 'r4', providerId: 'p1' });
    expect(last()).toEqual({
      kind: 'config-snapshot',
      reqId: 'r4',
      ok: false,
      error: NO_CATALOG_ERROR,
    });
  });

  it('converts a rejected read into an ok:false reply carrying the message', async () => {
    const catalog = fakeCatalog({ ensure: vi.fn(async () => { throw new Error('row missing'); }) });
    const { port, last } = fakePort();

    await handleGetConfig(
      fakeCtx({ catalog }),
      port,
      { kind: 'get-config', reqId: 'r4', providerId: 'p1' },
    );

    expect(last()).toMatchObject({ ok: false, error: 'row missing' });
  });

  it('stringifies a non-Error rejection', async () => {
    const catalog = fakeCatalog({ ensure: vi.fn(async () => { throw 'plain string'; }) });
    const { port, last } = fakePort();

    await handleGetConfig(
      fakeCtx({ catalog }),
      port,
      { kind: 'get-config', reqId: 'r4', providerId: 'p1' },
    );

    expect(last()).toMatchObject({ ok: false, error: 'plain string' });
  });
});

describe('handleListConfigs', () => {
  it('passes the subtype and includeAppData filters through', () => {
    const catalog = fakeCatalog();
    const { port, last } = fakePort();

    handleListConfigs(
      fakeCtx({ catalog }),
      port,
      { kind: 'list-configs', reqId: 'r5', subtype: 'stomp', includeAppData: true },
    );

    expect(catalog!.list).toHaveBeenCalledWith({ subtype: 'stomp', includeAppData: true });
    expect(last()).toMatchObject({ ok: true, configs: [{ providerId: 'p1' }] });
  });

  it('replies ok:false when the hub has no catalog', () => {
    const { port, last } = fakePort();
    handleListConfigs(fakeCtx(), port, { kind: 'list-configs', reqId: 'r5' });
    expect(last()).toMatchObject({ ok: false, error: NO_CATALOG_ERROR });
  });
});

describe('handleConfigInvalidate', () => {
  it('invalidates one provider, resyncs AppData, replies, then broadcasts', async () => {
    const catalog = fakeCatalog();
    const ctx = fakeCtx({ catalog });
    const { port, last } = fakePort();

    await handleConfigInvalidate(
      ctx,
      port,
      { kind: 'config-invalidate', reqId: 'r6', providerId: 'p1' },
    );

    expect(catalog!.invalidate).toHaveBeenCalledWith('p1');
    expect(ctx.resyncAppData).toHaveBeenCalled();
    expect(last()).toEqual({ kind: 'config-snapshot', reqId: 'r6', ok: true });
    expect(ctx.broadcastCatalogEvent).toHaveBeenCalledWith({
      kind: 'catalog-ready',
      providerId: 'p1',
    });
  });

  it('broadcasts a full invalidation when no providerId is given', async () => {
    const ctx = fakeCtx({ catalog: fakeCatalog() });
    const { port } = fakePort();

    await handleConfigInvalidate(ctx, port, { kind: 'config-invalidate', reqId: 'r6' });

    expect(ctx.broadcastCatalogEvent).toHaveBeenCalledWith({ kind: 'catalog-ready', full: true });
  });

  it('replies ok:false and broadcasts nothing when the hub has no catalog', async () => {
    const ctx = fakeCtx();
    const { port, last } = fakePort();

    await handleConfigInvalidate(ctx, port, { kind: 'config-invalidate', reqId: 'r6' });

    expect(last()).toMatchObject({ ok: false, error: NO_CATALOG_ERROR });
    expect(ctx.broadcastCatalogEvent).not.toHaveBeenCalled();
  });

  it('reports a failed invalidate without broadcasting a stale catalog-ready', async () => {
    const catalog = fakeCatalog({ invalidate: vi.fn(async () => { throw new Error('db closed'); }) });
    const ctx = fakeCtx({ catalog });
    const { port, last } = fakePort();

    await handleConfigInvalidate(ctx, port, { kind: 'config-invalidate', reqId: 'r6' });

    expect(last()).toMatchObject({ ok: false, error: 'db closed' });
    expect(ctx.broadcastCatalogEvent).not.toHaveBeenCalled();
  });

  it('reports a failed AppData resync too', async () => {
    const ctx = fakeCtx({
      catalog: fakeCatalog(),
      resyncAppData: vi.fn(async () => { throw new Error('mirror gone'); }),
    });
    const { port, last } = fakePort();

    await handleConfigInvalidate(ctx, port, { kind: 'config-invalidate', reqId: 'r6' });

    expect(last()).toMatchObject({ ok: false, error: 'mirror gone' });
    expect(ctx.broadcastCatalogEvent).not.toHaveBeenCalled();
  });
});

// ─── Bounded replies (WORKLOG item 14) ─────────────────────────────
//
// Observed live on a first-run worker boot: a ConfigManager read that never
// settles turned `get-config` into client-side silence — the caller's pending
// promise stranded forever with no error to react to. These tests pin the
// structural guarantee that closed the class: every async catalog handler
// replies EXACTLY ONCE — result, error, or deadline error — no matter what
// the underlying read does.

import { CATALOG_REPLY_DEADLINE_MS } from './hubCatalogRpc.js';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('replyBounded catalog handlers (WORKLOG item 14)', () => {
  it('get-config replies a deadline error when the store read never settles', async () => {
    vi.useFakeTimers();
    try {
      const never = deferred<never>();
      const catalog = fakeCatalog({ ensure: vi.fn(() => never.promise) });
      const { port, sent } = fakePort();

      const done = handleGetConfig(fakeCtx({ catalog }), port, {
        kind: 'get-config', reqId: 'r-stall', providerId: 'p1',
      });
      await vi.advanceTimersByTimeAsync(CATALOG_REPLY_DEADLINE_MS - 1);
      expect(sent).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        kind: 'config-snapshot', reqId: 'r-stall', ok: false,
        error: expect.stringContaining('did not settle'),
      });
      never.resolve(undefined as never);
      await done;
    } finally {
      vi.useRealTimers();
    }
  });

  it('a read settling AFTER the deadline does not produce a second reply', async () => {
    vi.useFakeTimers();
    try {
      const late = deferred<{ providerId: string }>();
      const catalog = fakeCatalog({ ensure: vi.fn(() => late.promise) });
      const { port, sent } = fakePort();

      const done = handleGetConfig(fakeCtx({ catalog }), port, {
        kind: 'get-config', reqId: 'r-late', providerId: 'p1',
      });
      await vi.advanceTimersByTimeAsync(CATALOG_REPLY_DEADLINE_MS);
      expect(sent).toHaveLength(1);

      late.resolve({ providerId: 'p1' });
      await done;
      expect(sent).toHaveLength(1);   // exactly once — the late result is dropped
    } finally {
      vi.useRealTimers();
    }
  });

  it('get-config still replies exactly once while an invalidation storm lands mid-read', async () => {
    // Mirrors the app-boot choreography captured in the browser trace:
    // the seed path fires a burst of config-invalidate requests around the
    // grid's first get-config.
    const read = deferred<{ providerId: string; name: string }>();
    const catalog = fakeCatalog({ ensure: vi.fn(() => read.promise) });
    const ctx = fakeCtx({ catalog });
    const { port, sent } = fakePort();

    const getDone = handleGetConfig(ctx, port, {
      kind: 'get-config', reqId: 'r-race', providerId: 'p1',
    });
    // Six invalidates while the read is in flight (as observed live).
    const invalidations = Promise.all(Array.from({ length: 6 }, (_v, i) =>
      handleConfigInvalidate(ctx, port, {
        kind: 'config-invalidate', reqId: `inv-${i}`, providerId: 'p1',
      })));
    await invalidations;
    read.resolve({ providerId: 'p1', name: 'STOMP Positions' });
    await getDone;

    const getReplies = sent.filter((s) => s.reqId === 'r-race');
    expect(getReplies).toHaveLength(1);
    expect(getReplies[0]).toMatchObject({ ok: true, config: { providerId: 'p1' } });
    // Every invalidate also answered exactly once.
    for (let i = 0; i < 6; i++) {
      expect(sent.filter((s) => s.reqId === `inv-${i}`)).toHaveLength(1);
    }
  });

  it('config-invalidate replies a deadline error yet still broadcasts on late completion', async () => {
    vi.useFakeTimers();
    try {
      const slow = deferred<void>();
      const catalog = fakeCatalog({ invalidate: vi.fn(() => slow.promise) });
      const broadcastCatalogEvent = vi.fn();
      const ctx = fakeCtx({ catalog, broadcastCatalogEvent });
      const { port, sent } = fakePort();

      const done = handleConfigInvalidate(ctx, port, {
        kind: 'config-invalidate', reqId: 'r-inv', providerId: 'p1',
      });
      await vi.advanceTimersByTimeAsync(CATALOG_REPLY_DEADLINE_MS);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ ok: false, error: expect.stringContaining('did not settle') });
      expect(broadcastCatalogEvent).not.toHaveBeenCalled();

      // The catalog DID eventually change — listeners must still hear it.
      slow.resolve();
      await done;
      expect(sent).toHaveLength(1);   // no second reply
      expect(broadcastCatalogEvent).toHaveBeenCalledWith({ kind: 'catalog-ready', providerId: 'p1' });
    } finally {
      vi.useRealTimers();
    }
  });
});

function providerRow(configId: string, displayText = configId): AppConfigRow {
  return {
    configId,
    appId: 'TestApp',
    userId: 'system',
    componentType: 'data-provider',
    componentSubType: 'mock',
    isTemplate: false,
    displayText,
    payload: { providerType: 'mock' },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-01-01T00:00:00.000Z',
    updatedTime: '2026-01-01T00:00:00.000Z',
  };
}

function fakeConfigManager(rows: Map<string, AppConfigRow>, opts: { conflict?: AppConfigRow } = {}) {
  return {
    saveConfig: vi.fn(async (row: AppConfigRow) => {
      if (opts.conflict) throw new OptimisticLockError(opts.conflict);
      rows.set(row.configId, { ...row, updatedBy: 'worker' });
    }),
    deleteConfig: vi.fn(async (id: string) => { rows.delete(id); }),
    getConfig: vi.fn(async (id: string) => rows.get(id)),
  } as unknown as ConfigManager;
}

describe('handleConfigSave / handleConfigDelete — the single writer (W2)', () => {
  it('answers not-available when the host has no ConfigManager', async () => {
    const { port, last } = fakePort();
    await handleConfigSave(fakeCtx(), port, { kind: 'config-save', reqId: 's0', row: providerRow('p1') });
    expect(last()).toMatchObject({ reqId: 's0', ok: false, error: NO_CATALOG_ERROR });
  });

  it('persists through the ConfigManager, refreshes the catalog BEFORE replying, and replies with the stored row', async () => {
    const rows = new Map<string, AppConfigRow>();
    const cm = fakeConfigManager(rows);
    const catalog = fakeCatalog();
    const ctx = fakeCtx({ catalog, configManager: cm });
    const { port, last } = fakePort();
    const order: string[] = [];
    (catalog!.invalidate as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push('invalidate'); });
    (ctx.resyncAppData as ReturnType<typeof vi.fn>).mockImplementation(async () => { order.push('resync'); });
    port.postMessage = ((orig) => (m: unknown) => { order.push('reply'); orig(m); })(port.postMessage);

    await handleConfigSave(ctx, port, { kind: 'config-save', reqId: 's1', row: providerRow('p1'), expectedUpdatedTime: 't0' });

    expect(cm.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ configId: 'p1' }), { expectedUpdatedTime: 't0' });
    expect(order).toEqual(['invalidate', 'resync', 'reply']);
    expect(last()).toMatchObject({ reqId: 's1', ok: true, row: expect.objectContaining({ configId: 'p1', updatedBy: 'worker' }) });
    expect(ctx.broadcastCatalogEvent).toHaveBeenCalledWith({ kind: 'catalog-ready', providerId: 'p1' });
    expect(ctx.ownWrites.size).toBe(0);
  });

  it('a non-catalog row (grid profile) is persisted without touching the catalog', async () => {
    const rows = new Map<string, AppConfigRow>();
    const catalog = fakeCatalog();
    const ctx = fakeCtx({ catalog, configManager: fakeConfigManager(rows) });
    const { port, last } = fakePort();
    await handleConfigSave(ctx, port, {
      kind: 'config-save', reqId: 's2',
      row: { ...providerRow('grid-1'), componentType: 'markets-grid-profile-set', componentSubType: '' },
    });
    expect(last()).toMatchObject({ reqId: 's2', ok: true });
    expect(catalog!.invalidate).not.toHaveBeenCalled();
    expect(ctx.broadcastCatalogEvent).not.toHaveBeenCalled();
  });

  it('a stale write surfaces as ok:false with the optimistic-lock code and the current row', async () => {
    const conflict = providerRow('p1', 'elsewhere');
    const ctx = fakeCtx({ catalog: fakeCatalog(), configManager: fakeConfigManager(new Map(), { conflict }) });
    const { port, last } = fakePort();
    await handleConfigSave(ctx, port, { kind: 'config-save', reqId: 's3', row: providerRow('p1'), expectedUpdatedTime: 'old' });
    expect(last()).toMatchObject({ reqId: 's3', ok: false, code: 'optimistic-lock', conflictRow: expect.objectContaining({ displayText: 'elsewhere' }) });
    expect(ctx.broadcastCatalogEvent).not.toHaveBeenCalled();
    expect(ctx.ownWrites.size).toBe(0);
  });

  it('delete of a catalog row refreshes the catalog and broadcasts; an unknown id just acks', async () => {
    const rows = new Map<string, AppConfigRow>([['p1', providerRow('p1')]]);
    const cm = fakeConfigManager(rows);
    const catalog = fakeCatalog();
    const ctx = fakeCtx({ catalog, configManager: cm });
    const { port, last } = fakePort();

    await handleConfigDelete(ctx, port, { kind: 'config-delete', reqId: 'd1', configId: 'p1' });
    expect(cm.deleteConfig).toHaveBeenCalledWith('p1');
    expect(catalog!.invalidate).toHaveBeenCalledWith('p1');
    expect(last()).toMatchObject({ reqId: 'd1', ok: true });
    expect(ctx.broadcastCatalogEvent).toHaveBeenCalledWith({ kind: 'catalog-ready', providerId: 'p1' });

    (ctx.broadcastCatalogEvent as ReturnType<typeof vi.fn>).mockClear();
    await handleConfigDelete(ctx, port, { kind: 'config-delete', reqId: 'd2', configId: 'ghost' });
    expect(last()).toMatchObject({ reqId: 'd2', ok: true });
    expect(ctx.broadcastCatalogEvent).not.toHaveBeenCalled();
  });
});
