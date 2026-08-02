/**
 * Catalog / config RPC handlers (`hub-ready`, `get-config`,
 * `list-configs`, `config-invalidate`, `hub-introspect`,
 * `provider-running`) — request/response over `config-snapshot`
 * events, correlated by `reqId`. Extracted from the hub; delivery and
 * state access come in via {@link CatalogRpcContext}.
 */

import type {
  ConfigInvalidateRequest,
  ConfigSnapshotEvent,
  GetConfigRequest,
  HubIntrospectRequest,
  HubIntrospectSnapshot,
  HubReadyRequest,
  ListConfigsRequest,
  ProviderRunningRequest,
  CatalogEvent,
} from '../protocol.js';
import type { ConfigCatalogCache } from '../../hub/ConfigCatalogCache.js';
import type { PortLike } from './hubTypes.js';

export interface CatalogRpcContext {
  catalog: ConfigCatalogCache | null;
  broadcastCatalogEvent(event: CatalogEvent): void;
  resyncAppData(): Promise<void>;
  buildIntrospect(): HubIntrospectSnapshot;
  isProviderRunning(providerId: string): boolean;
}

function reply(port: PortLike, snapshot: ConfigSnapshotEvent): void {
  port.postMessage(snapshot);
}

/**
 * Reply deadline for handlers that await a catalog/store read. Observed in
 * the wild (WORKLOG item 14): during a first-run worker boot, a
 * ConfigManager read can fail to settle, and an unbounded `await` before
 * `reply(...)` turns that into client-side silence — a stranded pending
 * promise with no error to react to. Chosen LONGER than the React hook's
 * own retry window (3 × 2.5s) so silent client-side re-issues own the fast
 * path and this is strictly the last-resort backstop.
 */
export const CATALOG_REPLY_DEADLINE_MS = 10_000;

/**
 * Run `work` and guarantee EXACTLY ONE reply on `reqId`: the work's result,
 * its error, or a deadline error if it settles neither way in time. A late
 * settle after the deadline reply is not re-sent — but its side effects
 * (e.g. `ensure()` caching the row) still land, so the caller's retry gets
 * the fast path.
 *
 * @returns true when `work` itself completed successfully (late or not) —
 *   lets callers gate follow-up broadcasts on real completion.
 */
async function replyBounded(
  port: PortLike,
  reqId: string,
  work: () => Promise<Omit<ConfigSnapshotEvent, 'kind' | 'reqId' | 'ok' | 'error'>>,
): Promise<boolean> {
  let replied = false;
  const send = (snapshot: ConfigSnapshotEvent): void => {
    if (replied) return;
    replied = true;
    reply(port, snapshot);
  };
  const timer = setTimeout(() => {
    send({
      kind: 'config-snapshot',
      reqId,
      ok: false,
      error: `catalog read did not settle within ${CATALOG_REPLY_DEADLINE_MS}ms`,
    });
  }, CATALOG_REPLY_DEADLINE_MS);
  try {
    const extra = await work();
    clearTimeout(timer);
    send({ kind: 'config-snapshot', reqId, ok: true, ...extra });
    return true;
  } catch (err) {
    clearTimeout(timer);
    send({
      kind: 'config-snapshot',
      reqId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function replyNoCatalog(port: PortLike, reqId: string): void {
  reply(port, {
    kind: 'config-snapshot',
    reqId,
    ok: false,
    error: 'Config catalog not available in this hub instance',
  });
}

export function handleHubReady(ctx: CatalogRpcContext, port: PortLike, req: HubReadyRequest): void {
  reply(port, {
    kind: 'config-snapshot',
    reqId: req.reqId,
    ok: true,
    ready: ctx.catalog?.isReady() ?? false,
  });
}

export function handleHubIntrospect(
  ctx: CatalogRpcContext,
  port: PortLike,
  req: HubIntrospectRequest,
): void {
  reply(port, {
    kind: 'config-snapshot',
    reqId: req.reqId,
    ok: true,
    introspect: ctx.buildIntrospect(),
  });
}

/** O(1) scalar probe — never serializes hub state (unlike introspect). */
export function handleProviderRunning(
  ctx: CatalogRpcContext,
  port: PortLike,
  req: ProviderRunningRequest,
): void {
  reply(port, {
    kind: 'config-snapshot',
    reqId: req.reqId,
    ok: true,
    running: ctx.isProviderRunning(req.providerId),
  });
}

export async function handleGetConfig(
  ctx: CatalogRpcContext,
  port: PortLike,
  req: GetConfigRequest,
): Promise<void> {
  if (!ctx.catalog) {
    replyNoCatalog(port, req.reqId);
    return;
  }
  // Phase 3: resolve the single provider on demand (cached or one-row read)
  // so a grid doesn't gate on the full catalog preload. Caching the row here
  // means the synchronous attach lookup that follows finds it too.
  const catalog = ctx.catalog;
  await replyBounded(port, req.reqId, async () => ({
    config: await catalog.ensure(req.providerId),
  }));
}

export function handleListConfigs(
  ctx: CatalogRpcContext,
  port: PortLike,
  req: ListConfigsRequest,
): void {
  if (!ctx.catalog) {
    replyNoCatalog(port, req.reqId);
    return;
  }
  reply(port, {
    kind: 'config-snapshot',
    reqId: req.reqId,
    ok: true,
    configs: ctx.catalog.list({
      subtype: req.subtype,
      includeAppData: req.includeAppData,
    }),
  });
}

export async function handleConfigInvalidate(
  ctx: CatalogRpcContext,
  port: PortLike,
  req: ConfigInvalidateRequest,
): Promise<void> {
  if (!ctx.catalog) {
    replyNoCatalog(port, req.reqId);
    return;
  }
  const catalog = ctx.catalog;
  const completed = await replyBounded(port, req.reqId, async () => {
    await catalog.invalidate(req.providerId);
    await ctx.resyncAppData();
    return {};
  });
  // Broadcast on real completion — including a completion that landed after
  // the deadline reply: the catalog DID change, listeners must still hear.
  if (completed) {
    ctx.broadcastCatalogEvent(
      req.providerId
        ? { kind: 'catalog-ready', providerId: req.providerId }
        : { kind: 'catalog-ready', full: true },
    );
  }
}
