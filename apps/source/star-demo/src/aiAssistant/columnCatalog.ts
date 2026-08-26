/**
 * What columns a grid actually has, as bare ids.
 *
 * A rule or grouping aimed at a non-existent column applies cleanly and then
 * does nothing visible — the worst failure mode in this whole surface, because
 * there is no error anywhere for the user to find. This is what `diagnose_grid`
 * checks expressions against.
 *
 * The column TOOLS don't use this: they take a column by whatever name the user
 * gave it, which needs header labels too — see `columnResolver.ts`.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
import { readActiveProfile, gridScopeId } from './gridProfiles';

/** Provider ids a grid is bound to, across both the live and historical slots. */
export async function readProviderBindings(
  configManager: ConfigManager,
  entry: RegistryEntry,
): Promise<string[]> {
  const gridLevelData = (await configManager.profiles.loadGridLevelData({ instanceId: gridScopeId(entry) })) as
    | { provider?: { liveProviderId?: string | null; historicalProviderId?: string | null } }
    | null;
  return [gridLevelData?.provider?.liveProviderId, gridLevelData?.provider?.historicalProviderId].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
}

/**
 * Column ids the grid actually has: the bound provider's columns plus any
 * calculated columns.
 */
export async function knownColumnIds(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  entry: RegistryEntry,
): Promise<string[]> {
  const ids: string[] = [];
  const gridLevelData = (await configManager.profiles.loadGridLevelData({ instanceId: gridScopeId(entry) })) as
    | { provider?: { liveProviderId?: string } }
    | null;
  const providerId = gridLevelData?.provider?.liveProviderId;
  if (providerId) {
    const provider = await configStore.get(providerId);
    const defs = (provider?.config as { columnDefinitions?: Array<{ field?: string }> } | undefined)?.columnDefinitions ?? [];
    for (const def of defs) if (def.field) ids.push(def.field);
  }
  const profile = await readActiveProfile(configManager, gridScopeId(entry));
  const virtual = ((profile.state['calculated-columns']?.data as { virtualColumns?: Array<{ colId?: string }> })?.virtualColumns) ?? [];
  for (const col of virtual) if (col.colId) ids.push(col.colId);
  return [...new Set(ids)];
}

