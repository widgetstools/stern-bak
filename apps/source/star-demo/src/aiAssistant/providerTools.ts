/**
 * Data-provider CRUD and field discovery.
 *
 * A provider without `columnDefinitions` / `keyColumn` renders an EMPTY grid
 * even while rows stream, because the grid derives its columns from the
 * provider config — so creation infers them where it can and says so plainly
 * where it can't.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import {
  validateProviderConfig,
  getDefaultProviderConfig,
  LOGGED_IN_USER_ID,
  type ColumnDefinition,
  type MockProviderConfig,
  type ProviderConfig,
  type ProviderType,
} from '@wellsfargo-starui/types';
import { loadRegistryConfig } from '@wellsfargo-starui/openfin/config';
import { resolveGridEntry, BLOTTER_COMPONENT_TYPE, gridScopeId } from './gridProfiles';
import { readProviderBindings } from './columnCatalog';
import { withInferredColumns, describeMockFields } from './providerColumns';
import { reloadBlottersUsingProvider } from './blotterTools';
import { describeReload } from './launchComponent';
import type { ToolExecutionResult } from './toolResult';

export async function listDataProviders(configStore: DataProviderConfigStore): Promise<ToolExecutionResult> {
  const providers = await configStore.list(LOGGED_IN_USER_ID, { includeAppData: true });
  const summary =
    providers.map((p) => `${p.name} (${p.providerType}, id=${p.providerId})`).join('; ') ||
    'No saved providers yet.';
  return { ok: true, summary, data: providers };
}

export async function getGridColumns(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const gridLevelData = (await configManager.profiles.loadGridLevelData({ instanceId: gridScopeId(entry) })) as
    | { provider?: { liveProviderId?: string } }
    | null;
  const providerId = gridLevelData?.provider?.liveProviderId;
  if (!providerId) return { ok: false, summary: `Grid "${targetGridId}" has no data provider bound yet.` };

  const provider = await configStore.get(providerId);
  const columnDefs = (provider?.config as { columnDefinitions?: Array<{ field: string; headerName: string; cellDataType?: string }> } | undefined)?.columnDefinitions ?? [];
  const columns = columnDefs.map((c) => ({ colId: c.field, headerName: c.headerName, cellDataType: c.cellDataType }));
  const summary =
    columns.map((c) => `${c.colId} (${c.headerName}${c.cellDataType ? `, ${c.cellDataType}` : ''})`).join(', ') ||
    `Grid "${targetGridId}"'s provider has no column definitions.`;
  return { ok: true, summary, data: columns };
}

/**
 * Field discovery that does NOT require a bound provider.
 *
 * `get_grid_columns` can only answer for a grid that already has a provider
 * whose `columnDefinitions` were saved. This answers "what fields exist?" from
 * a providerId OR a bare mock dataType, so the model can plan a blotter, a
 * rule or a filter before anything is created — instead of inventing a column
 * name that silently never matches.
 */
export async function describeDataFields(
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const providerId = args.providerId as string | undefined;
  const dataType = args.dataType as MockProviderConfig['dataType'] | undefined;

  if (providerId) {
    const provider = await configStore.get(providerId);
    if (!provider) return { ok: false, summary: `No data provider with id "${providerId}". Call list_data_providers.` };
    const config = provider.config as { columnDefinitions?: ColumnDefinition[]; providerType?: string; dataType?: MockProviderConfig['dataType'] };
    const saved = config.columnDefinitions ?? [];
    if (saved.length > 0) return { ok: true, summary: summariseFields(provider.name, saved), data: saved };
    if (config.providerType === 'mock') {
      const probed = describeMockFields(config.dataType ?? 'positions');
      return { ok: true, summary: summariseFields(provider.name, probed), data: probed };
    }
    return {
      ok: false,
      summary:
        `Provider "${provider.name}" (${config.providerType}) has no saved columnDefinitions. ` +
        'STOMP/REST feeds need a live probe — ask the user to open the Data Provider Editor and run Probe → Fields.',
    };
  }

  if (!dataType) return { ok: false, summary: 'Pass either providerId or dataType.' };
  const fields = describeMockFields(dataType);
  return { ok: true, summary: summariseFields(`mock ${dataType}`, fields), data: fields };
}

/** Field names are what the model needs inline; types stay in `data`. */
function summariseFields(label: string, fields: ColumnDefinition[]): string {
  const names = fields.map((f) => f.field);
  const head = names.slice(0, 40).join(', ');
  const rest = names.length > 40 ? `, … (${names.length} fields total)` : ` (${names.length} fields)`;
  return `${label}: ${head}${rest}`;
}

export async function createDataProvider(
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const a = args as { name?: string; description?: string; providerType?: ProviderType; config?: Record<string, unknown> };
  if (!a.name || !a.providerType || !a.config) {
    return { ok: false, summary: 'Missing required field(s): name, providerType, config.' };
  }
  const merged = { ...getDefaultProviderConfig(a.providerType), ...a.config, providerType: a.providerType } as ProviderConfig;
  const validation = validateProviderConfig(merged);
  if (!validation.isValid) {
    return { ok: false, summary: `Invalid provider config: ${validation.errors.join('; ')}` };
  }
  const withColumns = withInferredColumns(merged);
  const columnCount = (withColumns as { columnDefinitions?: unknown[] }).columnDefinitions?.length ?? 0;
  const created = await configStore.save(
    { name: a.name, description: a.description, providerType: a.providerType, config: withColumns, userId: LOGGED_IN_USER_ID },
    LOGGED_IN_USER_ID,
  );
  const columnNote =
    columnCount > 0
      ? ` with ${columnCount} columns inferred from sample data`
      : ' — no columns could be inferred, so open it in the Data Provider Editor and run Probe → Fields before binding it to a grid';
  return {
    ok: true,
    summary: `Created data provider "${created.name}" (id=${created.providerId})${columnNote}.`,
    data: created,
  };
}

export async function updateDataProvider(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const a = args as { providerId?: string; name?: string; description?: string; config?: Record<string, unknown> };
  if (!a.providerId) return { ok: false, summary: 'Missing required field: providerId.' };
  const existing = await configStore.get(a.providerId);
  if (!existing) return { ok: false, summary: `No data provider with id "${a.providerId}". Call list_data_providers.` };

  const mergedConfig = a.config
    ? ({ ...existing.config, ...a.config, providerType: existing.providerType } as ProviderConfig)
    : existing.config;
  const validation = validateProviderConfig(mergedConfig);
  if (!validation.isValid) {
    return { ok: false, summary: `Invalid provider config: ${validation.errors.join('; ')}` };
  }
  // Re-infer columns when the shape-defining fields changed (e.g. dataType).
  const saved = await configStore.save(
    {
      ...existing,
      name: a.name ?? existing.name,
      description: a.description ?? existing.description,
      config: a.config ? withInferredColumns(mergedConfig) : mergedConfig,
    },
    LOGGED_IN_USER_ID,
  );
  // A provider's columns (and any other config field) are read when a grid's
  // container mounts, so a config change — unlike name/description, which are
  // cosmetic — needs the same "reload the windows already showing it" step
  // set_provider_columns already does. Without this, columnDefinitions written
  // here through raw JSON save but never appear on an already-open blotter.
  const reloaded = a.config ? await reloadBlottersUsingProvider(configManager, a.providerId) : 0;
  return {
    ok: true,
    summary: `Updated data provider "${saved.name}" (id=${saved.providerId}).${a.config ? describeReload(reloaded) : ''}`,
    data: saved,
  };
}

/**
 * Deletes a provider config. Grids bound to it are reported rather than
 * silently rebound — a blotter whose feed vanished looks broken, and the user
 * should hear about it in the same breath as the delete.
 *
 * Destructive, so it requires `confirm: true`: a model that skips the question
 * gets told what would be deleted instead of deleting it.
 */
export async function deleteDataProvider(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const providerId = args.providerId as string | undefined;
  if (!providerId) return { ok: false, summary: 'Missing required field: providerId.' };
  const existing = await configStore.get(providerId);
  if (!existing) return { ok: false, summary: `No data provider with id "${providerId}". Call list_data_providers.` };

  const registry = await loadRegistryConfig();
  const boundGrids: string[] = [];
  for (const entry of registry?.entries ?? []) {
    if (entry.componentType !== BLOTTER_COMPONENT_TYPE) continue;
    const bindings = await readProviderBindings(configManager, entry);
    if (bindings.some((id) => id === providerId)) boundGrids.push(entry.displayName);
  }

  if (args.confirm !== true) {
    const boundNote = boundGrids.length > 0 ? ` It is still bound to ${boundGrids.join(', ')}.` : '';
    return {
      ok: false,
      summary:
        `Deleting "${existing.name}" (id=${providerId}) is permanent.${boundNote} ` +
        'Ask the user to confirm, then call again with confirm: true.',
    };
  }

  await configStore.remove(providerId);
  const warning = boundGrids.length > 0
    ? ` Still bound to ${boundGrids.join(', ')} — rebind with set_grid_provider or those grids will show no data.`
    : '';
  return { ok: true, summary: `Deleted data provider "${existing.name}" (id=${providerId}).${warning}` };
}
