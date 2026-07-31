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
import {
  handleConfigInvalidate,
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
