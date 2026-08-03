/**
 * `perspective-attach` RPC — the seam that binds a window's Perspective
 * Client to the worker-hosted engine.
 *
 * The gate this covers: every path answers. A worker with no engine, a
 * provider that hosts no Table, a composite key — each comes back with a
 * reason rather than leaving the caller's promise pending, because a window
 * that hears nothing has no way to tell "still connecting" from "never will".
 *
 * Fake ports throughout, and a fake host: nothing here needs wasm, and the
 * engine's own boot is covered by `perspectiveHost.smoke.test.ts`.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import {
  handlePerspectiveAttach,
  resolvePerspectiveTable,
  type PerspectiveRpcContext,
} from './hubPerspectiveRpc';
import type { PerspectiveHost } from '../perspective/index.js';
import type { PerspectiveTableFeed } from '../perspective/perspectiveTableFeed.js';
import type { ProviderSlot, PortLike } from './hubTypes.js';

interface CapturedReply {
  message: Record<string, unknown>;
  transfer: readonly Transferable[];
}

function makePort(): PortLike & { replies: CapturedReply[] } {
  const replies: CapturedReply[] = [];
  return {
    replies,
    postMessage(message: unknown, transfer?: readonly Transferable[]) {
      replies.push({ message: message as Record<string, unknown>, transfer: transfer ?? [] });
    },
  };
}

function makeHost(overrides: Partial<PerspectiveHost> = {}): PerspectiveHost {
  return {
    tableFactoryFor: () => async () => ({ update: async () => {}, delete: async () => {} }),
    attach: vi.fn(async () => {}),
    hostedTableNames: async () => [],
    attachedPorts: 0,
    stop: async () => {},
    ...overrides,
  } as PerspectiveHost;
}

/** A feed whose Table is already built — the declared-schema path. */
function makeFeed(table: unknown = { update: async () => {} }): PerspectiveTableFeed {
  return {
    table,
    schema: null,
    buffered: 0,
    whenReady: async () => table,
    tap: (emit) => emit,
    drain: async () => {},
    stop: async () => {},
  } as unknown as PerspectiveTableFeed;
}

function makeSlot(cfg: ProviderConfig, handle: Record<string, unknown>): ProviderSlot {
  return { cfg, handle } as unknown as ProviderSlot;
}

const PERSPECTIVE_CFG = {
  providerId: 'p1',
  providerType: 'mock-perspective',
  keyColumn: 'id',
  tableName: 'positions',
} as unknown as ProviderConfig;

function makeCtx(over: Partial<PerspectiveRpcContext> = {}): PerspectiveRpcContext {
  return {
    host: makeHost(),
    getSlot: () => undefined,
    getCatalogConfig: () => null,
    ...over,
  };
}

describe('resolvePerspectiveTable', () => {
  it('refuses a provider that is not in the catalog', () => {
    const out = resolvePerspectiveTable(makeCtx(), 'nope');
    expect(out).toEqual({ ok: false, reason: expect.stringContaining('not in the worker catalog') });
  });

  it('refuses a non-perspective provider type', () => {
    const ctx = makeCtx({
      getCatalogConfig: () => ({ providerType: 'stomp', keyColumn: 'id' } as unknown as ProviderConfig),
    });
    const out = resolvePerspectiveTable(ctx, 'p1');
    expect(out.ok).toBe(false);
    expect((out as { reason: string }).reason).toContain("is a 'stomp' provider");
  });

  it('refuses a composite keyColumn by naming the columns', () => {
    const ctx = makeCtx({
      getCatalogConfig: () =>
        ({ providerType: 'stomp-perspective', keyColumn: ['book', 'id'] } as unknown as ProviderConfig),
    });
    const out = resolvePerspectiveTable(ctx, 'p1');
    expect(out.ok).toBe(false);
    expect((out as { reason: string }).reason).toContain('composite keyColumn [book, id]');
  });

  it('refuses a missing keyColumn', () => {
    const ctx = makeCtx({
      getCatalogConfig: () => ({ providerType: 'mock-perspective' } as unknown as ProviderConfig),
    });
    const out = resolvePerspectiveTable(ctx, 'p1');
    expect(out.ok).toBe(false);
    expect((out as { reason: string }).reason).toContain('no keyColumn');
  });

  it('refuses a catalogued provider that is not running', () => {
    const ctx = makeCtx({ getCatalogConfig: () => PERSPECTIVE_CFG });
    const out = resolvePerspectiveTable(ctx, 'p1');
    expect(out.ok).toBe(false);
    expect((out as { reason: string }).reason).toContain('is not running');
  });

  it('refuses a running provider whose tee built no Table', () => {
    const ctx = makeCtx({
      getSlot: () => makeSlot(PERSPECTIVE_CFG, { tableName: 'positions', feed: null }),
    });
    const out = resolvePerspectiveTable(ctx, 'p1');
    expect(out.ok).toBe(false);
    expect((out as { reason: string }).reason).toContain('hosts no engine');
  });

  it('takes the table name from the LIVE handle, not the config', () => {
    const ctx = makeCtx({
      getSlot: () => makeSlot(PERSPECTIVE_CFG, { tableName: 'live-name', feed: makeFeed() }),
    });
    const out = resolvePerspectiveTable(ctx, 'p1');
    expect(out.ok).toBe(true);
    expect((out as { tableName: string }).tableName).toBe('live-name');
  });
});

describe('handlePerspectiveAttach', () => {
  it('answers ok with the table name and transfers a port', async () => {
    const attach = vi.fn(async () => {});
    const ctx = makeCtx({
      host: makeHost({ attach }),
      getSlot: () => makeSlot(PERSPECTIVE_CFG, { tableName: 'positions', feed: makeFeed() }),
    });
    const port = makePort();

    await handlePerspectiveAttach(ctx, port, {
      kind: 'perspective-attach',
      reqId: 'r1',
      providerId: 'p1',
    });

    expect(port.replies).toHaveLength(1);
    const [reply] = port.replies;
    expect(reply.message).toMatchObject({
      kind: 'perspective-attach-result',
      reqId: 'r1',
      ok: true,
      tableName: 'positions',
    });
    // The window's end rides the transfer list; the hub keeps port1 bound
    // to the ProxySession it just created.
    expect(reply.transfer).toHaveLength(1);
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it('answers a reason instead of hanging when the worker hosts no engine', async () => {
    const ctx = makeCtx({
      host: null,
      getSlot: () => makeSlot(PERSPECTIVE_CFG, { tableName: 'positions', feed: makeFeed() }),
    });
    const port = makePort();

    await handlePerspectiveAttach(ctx, port, {
      kind: 'perspective-attach',
      reqId: 'r1',
      providerId: 'p1',
    });

    expect(port.replies).toHaveLength(1);
    expect(port.replies[0].message).toMatchObject({ ok: false });
    expect(String(port.replies[0].message.reason)).toContain('hosts no Perspective engine');
    expect(port.replies[0].transfer).toHaveLength(0);
  });

  it('waits for an inferring feed to build its Table, then answers ok', async () => {
    let resolveTable!: (t: unknown) => void;
    const pending = new Promise<unknown>((resolve) => {
      resolveTable = resolve;
    });
    const feed = {
      table: null,
      whenReady: () => pending,
    } as unknown as PerspectiveTableFeed;
    const ctx = makeCtx({
      getSlot: () => makeSlot(PERSPECTIVE_CFG, { tableName: 'positions', feed }),
    });
    const port = makePort();

    const inFlight = handlePerspectiveAttach(ctx, port, {
      kind: 'perspective-attach',
      reqId: 'r1',
      providerId: 'p1',
    });
    expect(port.replies).toHaveLength(0);

    resolveTable({ update: async () => {} });
    await inFlight;

    expect(port.replies[0].message).toMatchObject({ ok: true, tableName: 'positions' });
  });

  it('refuses rather than waits forever when the Table never arrives', async () => {
    const feed = {
      table: null,
      whenReady: () => new Promise<unknown>(() => {}),
    } as unknown as PerspectiveTableFeed;
    const ctx = makeCtx({
      getSlot: () => makeSlot(PERSPECTIVE_CFG, { tableName: 'positions', feed }),
    });
    const port = makePort();

    await handlePerspectiveAttach(
      ctx,
      port,
      { kind: 'perspective-attach', reqId: 'r1', providerId: 'p1' },
      { waitMs: 5 },
    );

    expect(port.replies[0].message).toMatchObject({ ok: false });
    expect(String(port.replies[0].message.reason)).toContain('has not built its Perspective Table');
  });

  it('closes both ends and reports the reason when attach throws', async () => {
    const ctx = makeCtx({
      host: makeHost({
        attach: vi.fn(async () => {
          throw new Error('engine boot failed');
        }),
      }),
      getSlot: () => makeSlot(PERSPECTIVE_CFG, { tableName: 'positions', feed: makeFeed() }),
    });
    const port = makePort();

    await handlePerspectiveAttach(ctx, port, {
      kind: 'perspective-attach',
      reqId: 'r1',
      providerId: 'p1',
    });

    expect(port.replies[0].message).toMatchObject({ ok: false, reason: 'engine boot failed' });
    expect(port.replies[0].transfer).toHaveLength(0);
  });
});
