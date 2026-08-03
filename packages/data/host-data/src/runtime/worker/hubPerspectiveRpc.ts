/**
 * Perspective control-port RPC (`perspective-attach`) — extracted from the
 * hub, delivery and state access come in via {@link PerspectiveRpcContext}.
 *
 * What this hands a window is a ProxySession onto the worker's engine, over
 * a `MessageChannel` minted here. It is deliberately NOT the hub's own port:
 * Perspective's transport takes `onmessage` on whatever port it is given and
 * speaks a binary frame protocol on it, so sharing the control port would
 * make the two protocols overwrite each other's handler.
 *
 * Every failure answers a `reason`. A window that hears nothing back has no
 * way to tell "still connecting" from "will never work" and sits behind a
 * spinner forever, so silence is not an option even for a worker that hosts
 * no engine at all.
 */

import type {
  PerspectiveAttachRequest,
  PerspectiveAttachResultEvent,
  ProviderConfig,
} from '../protocol.js';
import type { PerspectiveHost } from '../perspective/index.js';
import type { PerspectiveTeeHandle } from '../providers/transports/perspectiveTee.js';
import type { PortLike, ProviderSlot } from './hubTypes.js';

/**
 * How long to wait for a provider's feed to finish building its Table
 * before refusing.
 *
 * A feed with a declared schema builds its Table at construction, so the
 * normal path never waits at all. A feed INFERRING its schema cannot build
 * one until the snapshot lands, and replying `ok` before then would hand the
 * window a table name that `open_table` throws on. Bounded rather than
 * open-ended because the alternative to a slow answer is no answer.
 */
export const PERSPECTIVE_TABLE_WAIT_MS = 10_000;

export interface PerspectiveRpcContext {
  /** Null on a worker built without `loadPerspective`. */
  host: PerspectiveHost | null;
  /** Running slot for a provider, or undefined when it is not started. */
  getSlot(providerId: string): ProviderSlot | undefined;
  /** Catalog row for a provider, used when no slot is running yet. */
  getCatalogConfig(providerId: string): ProviderConfig | null;
}

type FeedLike = NonNullable<PerspectiveTeeHandle['feed']>;

type Resolution =
  | { ok: true; tableName: string; feed: FeedLike }
  | { ok: false; reason: string };

function refuse(port: PortLike, reqId: string, reason: string): void {
  port.postMessage({
    kind: 'perspective-attach-result',
    reqId,
    ok: false,
    reason,
  } satisfies PerspectiveAttachResultEvent);
}

/**
 * Decide whether this provider can serve a Table, and under what name.
 *
 * The three refusals are all PERMANENT for the current config, which is why
 * they are worth naming separately — a caller should surface them rather
 * than retry. The one recoverable case (provider not started yet) is named
 * as such so the caller can retry after its data subscription lands.
 */
export function resolvePerspectiveTable(
  ctx: PerspectiveRpcContext,
  providerId: string,
): Resolution {
  const slot = ctx.getSlot(providerId);
  const cfg = slot?.cfg ?? ctx.getCatalogConfig(providerId);
  if (!cfg) {
    return { ok: false, reason: `Provider '${providerId}' is not in the worker catalog.` };
  }

  if (cfg.providerType !== 'stomp-perspective' && cfg.providerType !== 'mock-perspective') {
    return {
      ok: false,
      reason:
        `Provider '${providerId}' is a '${cfg.providerType}' provider and hosts no `
        + 'Perspective Table. Only stomp-perspective and mock-perspective do.',
    };
  }

  // Perspective indexes by a single scalar column, so a composite key has no
  // Table equivalent — the tee transports skip Table creation entirely for
  // one rather than silently indexing on the first column and letting rows
  // collide. Same refusal, stated where the window can read it.
  const keyColumn = (cfg as { keyColumn?: string | readonly string[] }).keyColumn;
  if (typeof keyColumn !== 'string' || keyColumn.length === 0) {
    return {
      ok: false,
      reason: Array.isArray(keyColumn)
        ? `Provider '${providerId}' has a composite keyColumn `
          + `[${keyColumn.join(', ')}], which cannot index a Perspective Table.`
        : `Provider '${providerId}' has no keyColumn, which a Perspective Table needs to index on.`,
    };
  }

  if (!slot) {
    return {
      ok: false,
      reason:
        `Provider '${providerId}' is not running, so no Table is hosted yet. `
        + 'Attach a data subscription first.',
    };
  }

  const tee = slot.handle as Partial<PerspectiveTeeHandle>;
  if (typeof tee.tableName !== 'string') {
    return {
      ok: false,
      reason: `Provider '${providerId}' is running without a Perspective tee.`,
    };
  }
  if (!tee.feed) {
    return {
      ok: false,
      reason:
        `Provider '${providerId}' is running without a Perspective Table — the worker `
        + 'that started it hosts no engine.',
    };
  }

  return { ok: true, tableName: tee.tableName, feed: tee.feed };
}

/** Settle with the feed's Table, or `null` if it takes longer than the deadline. */
async function awaitTable(feed: FeedLike, waitMs: number): Promise<unknown | null> {
  if (feed.table !== null) return feed.table;
  return Promise.race([
    feed.whenReady(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs)),
  ]);
}

export async function handlePerspectiveAttach(
  ctx: PerspectiveRpcContext,
  port: PortLike,
  req: PerspectiveAttachRequest,
  opts: { waitMs?: number } = {},
): Promise<void> {
  const { host } = ctx;
  if (!host) {
    refuse(
      port,
      req.reqId,
      'This SharedWorker hosts no Perspective engine. Boot the worker from the '
        + 'perspective entry (it passes loadPerspective) to use the pull path.',
    );
    return;
  }

  const resolved = resolvePerspectiveTable(ctx, req.providerId);
  if (!resolved.ok) {
    refuse(port, req.reqId, resolved.reason);
    return;
  }

  const table = await awaitTable(resolved.feed!, opts.waitMs ?? PERSPECTIVE_TABLE_WAIT_MS);
  if (table === null) {
    refuse(
      port,
      req.reqId,
      `Provider '${req.providerId}' has not built its Perspective Table yet `
        + `(waited ${opts.waitMs ?? PERSPECTIVE_TABLE_WAIT_MS}ms for its snapshot).`,
    );
    return;
  }

  const channel = new MessageChannel();
  try {
    await host.attach(channel.port1);
  } catch (err) {
    // Both ends, or the un-transferred one leaks for the life of the worker.
    try { channel.port1.close(); } catch { /* idempotent */ }
    try { channel.port2.close(); } catch { /* idempotent */ }
    refuse(port, req.reqId, err instanceof Error ? err.message : String(err));
    return;
  }

  port.postMessage(
    {
      kind: 'perspective-attach-result',
      reqId: req.reqId,
      ok: true,
      tableName: resolved.tableName,
    } satisfies PerspectiveAttachResultEvent,
    [channel.port2],
  );
}
