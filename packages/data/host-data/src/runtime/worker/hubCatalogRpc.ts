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
  try {
    const config = await ctx.catalog.ensure(req.providerId);
    reply(port, {
      kind: 'config-snapshot',
      reqId: req.reqId,
      ok: true,
      config,
    });
  } catch (err) {
    reply(port, {
      kind: 'config-snapshot',
      reqId: req.reqId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
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
  try {
    await ctx.catalog.invalidate(req.providerId);
    await ctx.resyncAppData();
    reply(port, {
      kind: 'config-snapshot',
      reqId: req.reqId,
      ok: true,
    });
    ctx.broadcastCatalogEvent(
      req.providerId
        ? { kind: 'catalog-ready', providerId: req.providerId }
        : { kind: 'catalog-ready', full: true },
    );
  } catch (err) {
    reply(port, {
      kind: 'config-snapshot',
      reqId: req.reqId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
