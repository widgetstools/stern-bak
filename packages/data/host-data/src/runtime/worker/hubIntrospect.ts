/**
 * Hub introspection snapshot builder — the `hub-introspect` RPC
 * payload for operator / dev tooling (HubInspectorDrawer, diagnostics
 * pane). Serializes the ENTIRE hub state, so it must never sit on a
 * hot path; window-open flows use the scalar `provider-running` probe
 * instead.
 */

import type {
  AppDataRow,
  HubIntrospectSnapshot,
  HubProviderIntrospectRow,
} from '../protocol.js';
import type { ConfigCatalogCache } from '../../hub/ConfigCatalogCache.js';
import type { ProviderSlot } from './hubTypes.js';
import type { SubscriberRegistry } from './SubscriberRegistry.js';
import { snapshotProviderStats } from './hubStats.js';

export interface IntrospectSources {
  providers: ReadonlyMap<string, ProviderSlot>;
  subscribers: SubscriberRegistry;
  configCatalog: ConfigCatalogCache | null;
  connectedPortCount: number;
  appDataListenerCount: number;
  appDataRows: readonly AppDataRow[];
}

export function buildIntrospectSnapshot(src: IntrospectSources): HubIntrospectSnapshot {
  const { providers, subscribers, configCatalog } = src;
  const runningIds = new Set(providers.keys());
  const rows: HubProviderIntrospectRow[] = [];
  const nameById = new Map<string, string>();
  if (configCatalog) {
    for (const row of configCatalog.list({ includeAppData: false })) {
      if (row.providerId && row.name) {
        nameById.set(row.providerId, row.name);
      }
    }
  }

  for (const [providerId, slot] of providers) {
    const stats = snapshotProviderStats(slot, subscribers.dataCount(providerId));
    rows.push({
      providerId,
      name: nameById.get(providerId),
      providerType: slot.cfg.providerType,
      running: true,
      status: slot.status,
      subscriberCount: stats.subscriberCount,
      statsListenerCount: subscribers.statsCount(providerId),
      rowCount: stats.rowCount,
      msgPerSec: stats.msgPerSec,
      publishPerSec: stats.publishPerSec,
      publishCount: stats.publishCount,
      lastMessageAt: stats.lastMessageAt,
      startedAt: stats.startedAt,
      errorCount: stats.errorCount,
      lastError: slot.lastError,
      keyDropCount: slot.keyDropCount,
      dataPlane: slot.dataPlane,
      cfg: slot.cfg,
      subscribers: subscribers.introspectRows(providerId),
    });
  }

  if (configCatalog) {
    for (const row of configCatalog.list({ includeAppData: false })) {
      if (!row.providerId || runningIds.has(row.providerId)) continue;
      if (row.providerType === 'appdata') continue;
      rows.push({
        providerId: row.providerId,
        name: row.name,
        providerType: row.providerType,
        running: false,
        cfg: configCatalog.getProviderConfig(row.providerId) ?? row.config ?? undefined,
      });
    }
  }

  rows.sort((a, b) => a.providerId.localeCompare(b.providerId));

  return {
    connectedPorts: src.connectedPortCount,
    catalogReady: configCatalog?.isReady() ?? false,
    catalogProviderCount: configCatalog?.list({ includeAppData: true }).length ?? 0,
    runningProviderCount: providers.size,
    providers: rows,
    appData: {
      listenerCount: src.appDataListenerCount,
      rows: src.appDataRows.map((r) => ({
        configId: r.configId,
        name: r.name,
        keyCount: Object.keys(r.values).length,
        values: r.values,
      })),
    },
  };
}
