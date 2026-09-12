/**
 * Merge the two workers' `hub-introspect` answers into the one operator
 * view the inspector drawer shows (worker-split W1c): the DATA hub knows
 * running providers, their subscribers and its ports; the PLATFORM-services
 * host knows the catalog (idle rows, names) and AppData. Neither alone is
 * the picture.
 */

import type { HubIntrospectSnapshot, HubProviderIntrospectRow } from '../runtime/protocol.js';

export function mergeHubIntrospect(
  data: HubIntrospectSnapshot,
  platform: HubIntrospectSnapshot | null,
): HubIntrospectSnapshot {
  if (!platform) return data;

  const catalogById = new Map<string, HubProviderIntrospectRow>();
  for (const row of platform.providers) catalogById.set(row.providerId, row);

  const providers: HubProviderIntrospectRow[] = [];
  const seen = new Set<string>();
  for (const row of data.providers) {
    // The data hub carries no catalog, so its running rows have no display
    // name — take it from the platform's view of the same providerId.
    const name = row.name ?? catalogById.get(row.providerId)?.name;
    providers.push(name === undefined ? row : { ...row, name });
    seen.add(row.providerId);
  }
  for (const row of platform.providers) {
    if (!seen.has(row.providerId)) providers.push(row);
  }
  providers.sort((a, b) => a.providerId.localeCompare(b.providerId));

  return {
    connectedPorts: data.connectedPorts,
    catalogReady: platform.catalogReady,
    catalogProviderCount: platform.catalogProviderCount,
    runningProviderCount: data.runningProviderCount,
    providers,
    appData: platform.appData,
    ...(data.fanout ? { fanout: data.fanout } : {}),
  };
}
