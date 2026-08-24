/**
 * Dispatches a tool call (by name + JSON args) to the real service/store
 * API it maps to. Every mutating handler validates its input the same way
 * the manual UI would before applying anything — the model never writes
 * state directly.
 *
 * This assistant runs in its own standalone window (no live MarketsGrid),
 * so grid customization tools read/write a target grid's *persisted*
 * profile through `ConfigManager.profiles` — the same bundled-row storage
 * a live grid's `ProfileManager` reads/writes — instead of a live
 * `GridPlatform.store`. `targetGridId` is a Component Registry entry id
 * (from `list_grids`); it's resolved to that entry's `configId`, which is
 * the profile-scope `instanceId`.
 */
import { useCallback } from 'react';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { useDataServices } from '@wellsfargo-starui/react/data/runtime';
import {
  validateProviderConfig,
  getDefaultProviderConfig,
  LOGGED_IN_USER_ID,
  type ProviderConfig,
  type ProviderType,
} from '@wellsfargo-starui/types';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  readDefaultProfile,
  patchGridModule,
  patchGridLevelData,
  listInstanceRows,
  describeFanOut,
} from './gridProfiles';
import type { RuleScope, ThemedCellStyleOverrides } from '@wellsfargo-starui/core';
import { normalizeRuleFeatures } from './ruleFeatures';
import {
  normalizeColumnStyleArgs,
  mergeThemedStyle,
  describeColumnStyle,
  wantsCells,
  wantsHeaders,
  type FormatPreset,
} from './columnStyle';
import { FEATURE_GUIDE_IDS, findFeatureGuide } from './featureGuides';
import { collectionsForModule, GRID_MODULES } from './moduleCollections';
import {
  listModuleItems,
  addModuleItem,
  updateModuleItem,
  removeModuleItem,
} from './moduleItemTools';
import { loadRegistryConfig, deriveTemplateConfigId, type RegistryEntry } from '@wellsfargo-starui/openfin/config';
import { usePlatformBootstrap } from '../platformBootstrap';
import {
  addRegistryEntry,
  addDockButton,
  buildRegistryEntry,
  registryEntryExists,
  updateRegistryEntry,
  removeRegistryEntry,
  removeDockButtons,
  renameDockButtons,
} from './registryOps';
import { withInferredColumns, describeMockFields } from './providerColumns';
import { launchBlotter, describeLaunch } from './launchComponent';
import type { ColumnDefinition, MockProviderConfig } from '@wellsfargo-starui/types';
import type { ToolName } from './tools';

const LOG = '[aiAssistant]';

/** Registered MarketsGrid blotters all share this route + componentType. */
const BLOTTER_HOST_URL = '/#/blotters/marketsgrid';
const BLOTTER_COMPONENT_TYPE = 'grid';

export interface ToolExecutionResult {
  ok: boolean;
  summary: string;
  data?: unknown;
}

async function resolveGridEntry(targetGridId: string): Promise<RegistryEntry | undefined> {
  const registry = await loadRegistryConfig();
  return registry?.entries.find((e) => e.id === targetGridId && e.componentType === 'grid');
}

async function listGrids(): Promise<ToolExecutionResult> {
  const registry = await loadRegistryConfig();
  const grids = (registry?.entries ?? []).filter((e) => e.componentType === 'grid');
  const summary =
    grids.map((g) => `${g.displayName} (id=${g.id})`).join('; ') ||
    'No grids are registered on the dock yet.';
  return { ok: true, summary, data: grids.map((g) => ({ id: g.id, displayName: g.displayName })) };
}

async function listDataProviders(configStore: DataProviderConfigStore): Promise<ToolExecutionResult> {
  const providers = await configStore.list(LOGGED_IN_USER_ID, { includeAppData: true });
  const summary =
    providers.map((p) => `${p.name} (${p.providerType}, id=${p.providerId})`).join('; ') ||
    'No saved providers yet.';
  return { ok: true, summary, data: providers };
}

async function getGridColumns(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const gridLevelData = (await configManager.profiles.loadGridLevelData({ instanceId: entry.configId })) as
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
async function describeDataFields(
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

/** Slugifies a display name into a registry `componentSubType`. */
function toSubType(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'blotter';
}

async function createBlotter(
  configManager: ConfigManager,
  appId: string,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const a = args as {
    displayName?: string;
    providerId?: string;
    addToDock?: boolean;
    asWindow?: boolean;
    openNow?: boolean;
  };
  if (!a.displayName) return { ok: false, summary: 'Missing required field: displayName.' };

  const componentSubType = toSubType(a.displayName);
  // Registry entry id === template configId === `<type>-<subtype>` lowercase.
  const id = deriveTemplateConfigId(BLOTTER_COMPONENT_TYPE, componentSubType);
  if (await registryEntryExists(id)) {
    return { ok: false, summary: `A blotter with id "${id}" already exists — pick a different name.` };
  }

  const asWindow = a.asWindow ?? true;
  await addRegistryEntry(
    buildRegistryEntry({
      id,
      hostUrl: BLOTTER_HOST_URL,
      displayName: a.displayName,
      componentType: BLOTTER_COMPONENT_TYPE,
      componentSubType,
      configId: id,
      iconId: 'lucide:table',
      appId,
      singleton: false,
      asWindow,
    }),
  );

  // Seed the TEMPLATE config row so the blotter opens with its caption and
  // (when given) an already-bound live provider, instead of an unconfigured
  // grid. `launchRegisteredComponent` clones this row onto each new instance.
  //
  // `identity` is required: without it the row's componentType is rewritten to
  // the generic 'markets-grid-profile-set', which breaks registered-component
  // queries. Production template rows carry componentType 'grid' +
  // componentSubType + isTemplate:true — this reproduces that exactly.
  const identity = {
    componentType: BLOTTER_COMPONENT_TYPE,
    componentSubType,
    isTemplate: true,
    singleton: false,
  };
  await configManager.profiles.saveGridLevelData(
    { instanceId: id },
    {
      v: 1,
      provider: { liveProviderId: a.providerId ?? null, historicalProviderId: null, mode: 'live' },
      caption: a.displayName,
    },
    { identity },
  );

  const wantDock = a.addToDock ?? true;
  const addedToDock = wantDock
    ? await addDockButton({ registryEntryId: id, tooltip: a.displayName, iconId: 'lucide:table', asWindow })
    : false;

  // Show it, don't just register it — a blotter the user has to go hunting
  // for on the dock isn't really "created" from their point of view.
  const launch = (a.openNow ?? true) ? await launchBlotter(id, asWindow) : null;

  return {
    ok: true,
    summary:
      `Created blotter "${a.displayName}" (id=${id})` +
      (addedToDock
        ? ' and added a dock button for it'
        : wantDock
          ? ' (no dock button — this platform has no saved dock config yet; add one from Workspace Setup)'
          : '') +
      (a.providerId ? `, bound to provider ${a.providerId}` : ', with no data provider bound yet') +
      '.' +
      (launch ? describeLaunch(launch, a.displayName) : ''),
    data: { id, displayName: a.displayName, opened: launch?.ok ?? false },
  };
}

/** Opens an already-registered blotter — "show me the axe blotter". */
async function openBlotter(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const asWindow = (args.asWindow as boolean | undefined) ?? entry.asWindow ?? true;
  const launch = await launchBlotter(entry.id, asWindow);
  return launch.ok
    ? { ok: true, summary: `Opened "${entry.displayName}".` }
    : { ok: false, summary: describeLaunch(launch, entry.displayName).trim() };
}


function listGridModules(): ToolExecutionResult {
  return {
    ok: true,
    summary: GRID_MODULES.map((m) => m.id).join(', '),
    data: {
      modules: GRID_MODULES.map((m) => {
        const collections = collectionsForModule(m.id);
        return {
          ...m,
          // Advertised inline so the model doesn't have to guess which modules
          // have a worked example, or which hold individually addressable items.
          hasFeatureGuide: FEATURE_GUIDE_IDS.includes(m.id),
          ...(collections.length > 0
            ? { itemCollections: collections.map((c) => ({ collection: c.collection, idField: c.idField, readOnly: c.readOnly ?? false })) }
            : {}),
        };
      }),
      featureGuides: FEATURE_GUIDE_IDS,
      hint:
        'get_feature_guide(featureId) gives exact config shapes before you configure a module. Modules listing itemCollections support per-item CRUD via list_module_items / add_module_item / update_module_item / remove_module_item; the rest are settings objects you edit with update_module_settings.',
    },
  };
}

function getFeatureGuide(args: Record<string, unknown>): ToolExecutionResult {
  const featureId = args.featureId as string | undefined;
  const guide = findFeatureGuide(featureId);
  if (!guide) {
    return {
      ok: false,
      summary: `No guide for "${featureId ?? ''}". Available: ${FEATURE_GUIDE_IDS.join(', ')}.`,
    };
  }
  return { ok: true, summary: guide.title, data: { summary: guide.summary, detail: guide.detail } };
}

async function getModuleSettings(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; moduleId?: string };
  if (!a.targetGridId || !a.moduleId) return { ok: false, summary: 'Missing required field(s): targetGridId, moduleId.' };
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${a.targetGridId}".` };
  if (!GRID_MODULES.some((m) => m.id === a.moduleId)) {
    return { ok: false, summary: `Unknown module "${a.moduleId}". Call list_grid_modules for valid ids.` };
  }

  const profile = await readDefaultProfile(configManager, entry.configId);
  const data = profile.state[a.moduleId]?.data;
  if (data === undefined) {
    return {
      ok: true,
      summary: `"${a.moduleId}" has no saved settings on "${entry.displayName}" yet — it's using platform defaults. You can still set values with update_module_settings.`,
      data: {},
    };
  }
  return { ok: true, summary: `Current "${a.moduleId}" settings for "${entry.displayName}".`, data };
}

/**
 * Shallow-merges `settings` into one module's saved state — so supplying a
 * single key (e.g. `enableCellChangeFlash`) leaves every other option alone.
 * Collection-shaped modules (rules/virtualColumns/assignments) are better
 * edited through their dedicated add/update/remove tools, which preserve
 * per-item identity; a wholesale array replace here would drop ids.
 */
async function updateModuleSettings(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; moduleId?: string; settings?: Record<string, unknown> };
  if (!a.targetGridId || !a.moduleId || !a.settings) {
    return { ok: false, summary: 'Missing required field(s): targetGridId, moduleId, settings.' };
  }
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${a.targetGridId}".` };
  if (!GRID_MODULES.some((m) => m.id === a.moduleId)) {
    return { ok: false, summary: `Unknown module "${a.moduleId}". Call list_grid_modules for valid ids.` };
  }
  const keys = Object.keys(a.settings);
  if (keys.length === 0) return { ok: false, summary: 'No settings supplied.' };

  const fan = await patchGridModule(configManager, entry, a.moduleId, (prev) => ({
    ...((prev as Record<string, unknown> | undefined) ?? {}),
    ...a.settings,
  }));
  return {
    ok: true,
    summary: `Set ${keys.join(', ')} on "${entry.displayName}"${describeFanOut(fan)} (${a.moduleId}). Reopen the blotter to see it applied.`,
  };
}

/**
 * Reports what customization a grid currently carries. The model needs this
 * before it can UPDATE anything — rules are addressed by generated id, which
 * it has no other way to learn.
 */
async function listGridCustomizations(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const profile = await readDefaultProfile(configManager, entry.configId);
  const calculated = ((profile.state['calculated-columns']?.data as { virtualColumns?: Array<Record<string, unknown>> })?.virtualColumns) ?? [];
  const rules = ((profile.state['conditional-styling']?.data as { rules?: Array<Record<string, unknown>> })?.rules) ?? [];
  const assignments = ((profile.state['column-customization']?.data as { assignments?: Record<string, unknown> })?.assignments) ?? {};

  const data = {
    calculatedColumns: calculated.map((v) => ({ colId: v.colId, headerName: v.headerName, expression: v.expression })),
    conditionalRules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      priority: r.priority,
      expression: r.expression,
      scope: r.scope,
      // Reported so the model can verify what it built and patch one field
      // without re-sending the rest — omitted when the rule doesn't use them.
      ...(r.flash !== undefined ? { flash: r.flash } : {}),
      ...(r.indicator !== undefined ? { indicator: r.indicator } : {}),
      ...(r.animation !== undefined ? { animation: r.animation } : {}),
      ...(r.activeDurationMs !== undefined ? { activeDurationMs: r.activeDurationMs } : {}),
    })),
    styledColumns: Object.keys(assignments),
  };
  const summary =
    `${data.calculatedColumns.length} calculated column(s), ${data.conditionalRules.length} styling rule(s), ` +
    `${data.styledColumns.length} styled column(s) on "${entry.displayName}".`;
  return { ok: true, summary, data };
}

async function removeCalculatedColumn(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; colId?: string };
  if (!a.targetGridId || !a.colId) return { ok: false, summary: 'Missing required field(s): targetGridId, colId.' };
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${a.targetGridId}".` };

  let found = false;
  await patchGridModule(configManager, entry, 'calculated-columns', (prev) => {
    const prevState = (prev as { virtualColumns?: Array<{ colId: string }> } | undefined) ?? { virtualColumns: [] };
    const kept = (prevState.virtualColumns ?? []).filter((v) => v.colId !== a.colId);
    found = kept.length !== (prevState.virtualColumns ?? []).length;
    return { virtualColumns: kept };
  });
  return found
    ? { ok: true, summary: `Removed calculated column "${a.colId}" from "${a.targetGridId}".` }
    : { ok: false, summary: `No calculated column "${a.colId}" on "${a.targetGridId}". Call list_grid_customizations to see what exists.` };
}

async function updateConditionalStylingRule(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as {
    targetGridId?: string;
    ruleId?: string;
    enabled?: boolean;
    name?: string;
    priority?: number;
    expression?: string;
    style?: unknown;
    scope?: unknown;
  };
  if (!a.targetGridId || !a.ruleId) return { ok: false, summary: 'Missing required field(s): targetGridId, ruleId.' };
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${a.targetGridId}".` };

  // Validate before writing: flash.target legality depends on the rule's
  // scope, so read the existing rule for it (or the incoming patch's scope
  // when the caller is changing it) and bail without touching the profile.
  const existing = await readDefaultProfile(configManager, entry.configId);
  const existingRule = (
    (existing.state['conditional-styling']?.data as { rules?: Array<Record<string, unknown>> })?.rules ?? []
  ).find((r) => r.id === a.ruleId);
  if (!existingRule) {
    return { ok: false, summary: `No styling rule with id "${a.ruleId}". Call list_grid_customizations to see rule ids.` };
  }
  const features = normalizeRuleFeatures(args, (a.scope ?? existingRule.scope) as RuleScope | undefined);
  if (!features.ok) return { ok: false, summary: features.error };

  let found = false;
  await patchGridModule(configManager, entry, 'conditional-styling', (prev) => {
    const prevState = (prev as { rules?: Array<Record<string, unknown>> } | undefined) ?? { rules: [] };
    const rules = (prevState.rules ?? []).map((r) => {
      if (r.id !== a.ruleId) return r;
      found = true;
      // Only overwrite fields the caller actually supplied.
      const patch: Record<string, unknown> = { ...features.features };
      for (const k of ['enabled', 'name', 'priority', 'expression', 'style', 'scope'] as const) {
        if (a[k] !== undefined) patch[k] = a[k];
      }
      return { ...r, ...patch };
    });
    return { rules };
  });
  return found
    ? { ok: true, summary: `Updated styling rule ${a.ruleId} on "${a.targetGridId}".` }
    : { ok: false, summary: `No styling rule with id "${a.ruleId}". Call list_grid_customizations to see rule ids.` };
}

async function removeConditionalStylingRule(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; ruleId?: string };
  if (!a.targetGridId || !a.ruleId) return { ok: false, summary: 'Missing required field(s): targetGridId, ruleId.' };
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${a.targetGridId}".` };

  let found = false;
  await patchGridModule(configManager, entry, 'conditional-styling', (prev) => {
    const prevState = (prev as { rules?: Array<{ id: string }> } | undefined) ?? { rules: [] };
    const kept = (prevState.rules ?? []).filter((r) => r.id !== a.ruleId);
    found = kept.length !== (prevState.rules ?? []).length;
    return { rules: kept };
  });
  return found
    ? { ok: true, summary: `Removed styling rule ${a.ruleId} from "${a.targetGridId}".` }
    : { ok: false, summary: `No styling rule with id "${a.ruleId}". Call list_grid_customizations to see rule ids.` };
}

async function clearColumnStyle(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; colId?: string };
  if (!a.targetGridId || !a.colId) return { ok: false, summary: 'Missing required field(s): targetGridId, colId.' };
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${a.targetGridId}".` };
  const colId = a.colId;

  let found = false;
  await patchGridModule(configManager, entry, 'column-customization', (prev) => {
    const prevState = (prev as { assignments?: Record<string, unknown> } | undefined) ?? { assignments: {} };
    const assignments = { ...prevState.assignments };
    found = colId in assignments;
    delete assignments[colId];
    return { ...prevState, assignments };
  });
  return found
    ? { ok: true, summary: `Cleared styling on column "${colId}" of "${a.targetGridId}".` }
    : { ok: false, summary: `Column "${colId}" has no styling on "${a.targetGridId}".` };
}

async function updateDataProvider(configStore: DataProviderConfigStore, args: Record<string, unknown>): Promise<ToolExecutionResult> {
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
  return { ok: true, summary: `Updated data provider "${saved.name}" (id=${saved.providerId}).`, data: saved };
}

/** Provider ids a grid is bound to, across both the live and historical slots. */
async function readProviderBindings(configManager: ConfigManager, entry: RegistryEntry): Promise<string[]> {
  const gridLevelData = (await configManager.profiles.loadGridLevelData({ instanceId: entry.configId })) as
    | { provider?: { liveProviderId?: string | null; historicalProviderId?: string | null } }
    | null;
  return [gridLevelData?.provider?.liveProviderId, gridLevelData?.provider?.historicalProviderId].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
}

/**
 * Deletes a provider config. Grids bound to it are reported rather than
 * silently rebound — a blotter whose feed vanished looks broken, and the user
 * should hear about it in the same breath as the delete.
 */
async function deleteDataProvider(
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

  await configStore.remove(providerId);
  const warning = boundGrids.length > 0
    ? ` Still bound to ${boundGrids.join(', ')} — rebind with set_grid_provider or those grids will show no data.`
    : '';
  return { ok: true, summary: `Deleted data provider "${existing.name}" (id=${providerId}).${warning}` };
}

async function renameBlotter(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; displayName?: string };
  if (!a.targetGridId || !a.displayName) return { ok: false, summary: 'Missing required field(s): targetGridId, displayName.' };
  const ok = await updateRegistryEntry(a.targetGridId, { displayName: a.displayName });
  if (!ok) return { ok: false, summary: `No grid registered with id "${a.targetGridId}".` };
  await renameDockButtons(a.targetGridId, a.displayName);
  return { ok: true, summary: `Renamed to "${a.displayName}" (its id stays ${a.targetGridId}).` };
}

async function deleteBlotter(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string };
  if (!a.targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const removed = await removeRegistryEntry(a.targetGridId);
  if (!removed) return { ok: false, summary: `No grid registered with id "${a.targetGridId}".` };
  // Always drop the buttons too — a button pointing at a deleted entry is a
  // dead dock item that warns and no-ops on click.
  const buttons = await removeDockButtons(a.targetGridId);
  return {
    ok: true,
    summary:
      `Deleted blotter "${a.targetGridId}"${buttons > 0 ? ` and removed ${buttons} dock button(s)` : ''}. ` +
      'Its saved settings row is left in place, so recreating it with the same name restores them.',
  };
}

/** Re-binds an existing blotter to a different provider, preserving caption/bindings. */
async function setGridProvider(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; providerId?: string; mode?: 'live' | 'historical' };
  if (!a.targetGridId || !a.providerId) {
    return { ok: false, summary: 'Missing required field(s): targetGridId, providerId.' };
  }
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${a.targetGridId}". Call list_grids to see valid ids.` };

  const mode = a.mode ?? 'live';
  // Fans out to open instances as well as the template — each keeps its own
  // caption and the slot it isn't being rebound on.
  const fan = await patchGridLevelData(configManager, entry, (prev) => {
    const prevProvider = (prev.provider ?? {}) as { liveProviderId?: string | null; historicalProviderId?: string | null };
    return {
      ...prev,
      v: 1,
      provider: {
        liveProviderId: mode === 'live' ? a.providerId : prevProvider.liveProviderId ?? null,
        historicalProviderId: mode === 'historical' ? a.providerId : prevProvider.historicalProviderId ?? null,
        mode,
      },
      caption: (prev.caption as string | undefined) ?? entry.displayName,
    };
  });
  return {
    ok: true,
    summary:
      `Bound "${entry.displayName}"${describeFanOut(fan)} to provider ${a.providerId} (${mode}). ` +
      'Reopen the blotter to pick up the new feed.',
  };
}

async function createDataProvider(configStore: DataProviderConfigStore, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { name?: string; description?: string; providerType?: ProviderType; config?: Record<string, unknown> };
  if (!a.name || !a.providerType || !a.config) {
    return { ok: false, summary: 'Missing required field(s): name, providerType, config.' };
  }
  const merged = { ...getDefaultProviderConfig(a.providerType), ...a.config, providerType: a.providerType } as ProviderConfig;
  const validation = validateProviderConfig(merged);
  if (!validation.isValid) {
    return { ok: false, summary: `Invalid provider config: ${validation.errors.join('; ')}` };
  }
  // A provider without columnDefinitions/keyColumn renders an EMPTY grid even
  // though rows stream — the grid derives its columns from the provider config.
  // For mocks we can infer both offline; see providerColumns.ts.
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

/**
 * Reports the open instances of a blotter. The model needs this to explain
 * where a change landed — and to see when a window has drifted from the
 * template it was cloned from.
 */
async function listGridInstances(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const rows = await listInstanceRows(configManager, entry);
  const summary = entry.singleton
    ? `"${entry.displayName}" is a singleton — its window uses the template row directly, so changes always apply to it.`
    : `${rows.length} open/saved instance(s) of "${entry.displayName}" besides the template. Changes are applied to all of them.`;
  return {
    ok: true,
    summary,
    data: { templateConfigId: entry.configId, singleton: entry.singleton === true, instances: rows },
  };
}

async function addCalculatedColumn(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as {
    targetGridId?: string;
    colId?: string;
    headerName?: string;
    expression?: string;
    cellDataType?: string;
    position?: number;
  };
  if (!a.targetGridId || !a.colId || !a.headerName || !a.expression) {
    return { ok: false, summary: 'Missing required field(s): targetGridId, colId, headerName, expression.' };
  }
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${a.targetGridId}". Call list_grids to see valid ids.` };

  const fan = await patchGridModule(configManager, entry, 'calculated-columns', (prev) => {
    const prevState = (prev as { virtualColumns?: Array<{ colId: string }> } | undefined) ?? { virtualColumns: [] };
    return {
      virtualColumns: [
        ...(prevState.virtualColumns ?? []).filter((v) => v.colId !== a.colId),
        { colId: a.colId, headerName: a.headerName, expression: a.expression, cellDataType: a.cellDataType, position: a.position },
      ],
    };
  });
  return { ok: true, summary: `Added calculated column "${a.headerName}" (${a.colId}) = ${a.expression} to "${a.targetGridId}"${describeFanOut(fan)}.` };
}

async function addConditionalStylingRule(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as {
    targetGridId?: string;
    name?: string;
    scope?: unknown;
    expression?: string;
    style?: unknown;
    priority?: number;
  };
  if (!a.targetGridId || !a.name || !a.scope || !a.expression || !a.style) {
    return { ok: false, summary: 'Missing required field(s): targetGridId, name, scope, expression, style.' };
  }
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${a.targetGridId}". Call list_grids to see valid ids.` };

  const features = normalizeRuleFeatures(args, a.scope as RuleScope | undefined);
  if (!features.ok) return { ok: false, summary: features.error };

  const rule = {
    id: `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: a.name,
    enabled: true,
    priority: a.priority ?? 100,
    scope: a.scope,
    expression: a.expression,
    style: a.style,
    ...features.features,
  };
  const fan = await patchGridModule(configManager, entry, 'conditional-styling', (prev) => {
    const prevState = (prev as { rules?: unknown[] } | undefined) ?? { rules: [] };
    return { rules: [...(prevState.rules ?? []), rule] };
  });
  return { ok: true, summary: `Added conditional-styling rule "${a.name}" to "${a.targetGridId}"${describeFanOut(fan)}.` };
}

/** Which global formatter slot a preset belongs in — headers carry no value. */
function globalFormatterKey(preset: FormatPreset): 'globalCellNumberFormatter' | 'globalCellDateFormatter' {
  return preset === 'date' || preset === 'datetime' ? 'globalCellDateFormatter' : 'globalCellNumberFormatter';
}

interface ColumnCustomizationShape {
  assignments?: Record<string, Record<string, unknown>>;
  globalCellStyle?: ThemedCellStyleOverrides;
  globalHeaderStyle?: ThemedCellStyleOverrides;
  globalCellNumberFormatter?: unknown;
  globalCellDateFormatter?: unknown;
}

async function setColumnStyle(configManager: ConfigManager, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const parsed = normalizeColumnStyleArgs(args);
  if (!parsed.ok) return { ok: false, summary: parsed.error };
  const style = parsed.value;
  const formatter = style.formatPreset ? { kind: 'preset' as const, preset: style.formatPreset } : undefined;

  await patchGridModule(configManager, entry, 'column-customization', (prev) => {
    const prevState = (prev as ColumnCustomizationShape | undefined) ?? { assignments: {} };

    // "Every column" is one global-baseline write, not N per-column writes.
    // The engine layers global → per-column, so existing per-column styling
    // still wins where it was set explicitly.
    if (style.allColumns) {
      return {
        ...prevState,
        ...(wantsCells(style.target) ? { globalCellStyle: mergeThemedStyle(prevState.globalCellStyle, style) } : {}),
        ...(wantsHeaders(style.target) ? { globalHeaderStyle: mergeThemedStyle(prevState.globalHeaderStyle, style) } : {}),
        ...(formatter && style.formatPreset ? { [globalFormatterKey(style.formatPreset)]: formatter } : {}),
      };
    }

    const assignments = { ...prevState.assignments };
    for (const colId of style.colIds) {
      const existing = assignments[colId] ?? { colId };
      assignments[colId] = {
        ...existing,
        colId,
        ...(wantsCells(style.target)
          ? { cellStyleOverrides: mergeThemedStyle(existing.cellStyleOverrides as ThemedCellStyleOverrides | undefined, style) }
          : {}),
        ...(wantsHeaders(style.target)
          ? { headerStyleOverrides: mergeThemedStyle(existing.headerStyleOverrides as ThemedCellStyleOverrides | undefined, style) }
          : {}),
        ...(formatter ? { valueFormatterTemplate: formatter } : {}),
      };
    }
    return { ...prevState, assignments };
  });

  const what = describeColumnStyle(style);
  return {
    ok: true,
    summary: style.allColumns
      ? `All columns on "${targetGridId}": ${what}.`
      : `${style.colIds.length} column(s) on "${targetGridId}" (${style.colIds.join(', ')}): ${what}.`,
  };
}


export interface ToolExecutionContext {
  configManager: ConfigManager;
  /** ConfigManager-backed provider store (from `<DataHubProvider>`). NOT the
   *  legacy `dataProviderConfigService`, which defaults to REST mode and
   *  would POST to a config server that isn't running locally. */
  configStore: DataProviderConfigStore;
  /** Deployment app id — stamped onto registry entries created here. */
  appId: string;
}

async function runTool(name: ToolName, ctx: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionResult> {
  switch (name) {
    case 'list_grids':
      return listGrids();
    case 'list_data_providers':
      return listDataProviders(ctx.configStore);
    case 'get_grid_columns':
      return getGridColumns(ctx.configManager, ctx.configStore, args);
    case 'list_grid_instances':
      return listGridInstances(ctx.configManager, args);
    case 'describe_data_fields':
      return describeDataFields(ctx.configStore, args);
    case 'create_blotter':
      return createBlotter(ctx.configManager, ctx.appId, args);
    case 'open_blotter':
      return openBlotter(args);
    case 'set_grid_provider':
      return setGridProvider(ctx.configManager, args);
    case 'list_grid_customizations':
      return listGridCustomizations(ctx.configManager, args);
    case 'list_grid_modules':
      return listGridModules();
    case 'get_feature_guide':
      return getFeatureGuide(args);
    case 'list_module_items':
      return listModuleItems(ctx.configManager, args);
    case 'add_module_item':
      return addModuleItem(ctx.configManager, args);
    case 'update_module_item':
      return updateModuleItem(ctx.configManager, args);
    case 'remove_module_item':
      return removeModuleItem(ctx.configManager, args);
    case 'get_module_settings':
      return getModuleSettings(ctx.configManager, args);
    case 'update_module_settings':
      return updateModuleSettings(ctx.configManager, args);
    case 'update_data_provider':
      return updateDataProvider(ctx.configStore, args);
    case 'delete_data_provider':
      return deleteDataProvider(ctx.configManager, ctx.configStore, args);
    case 'remove_calculated_column':
      return removeCalculatedColumn(ctx.configManager, args);
    case 'update_conditional_styling_rule':
      return updateConditionalStylingRule(ctx.configManager, args);
    case 'remove_conditional_styling_rule':
      return removeConditionalStylingRule(ctx.configManager, args);
    case 'clear_column_style':
      return clearColumnStyle(ctx.configManager, args);
    case 'rename_blotter':
      return renameBlotter(args);
    case 'delete_blotter':
      return deleteBlotter(args);
    case 'create_data_provider':
      return createDataProvider(ctx.configStore, args);
    case 'add_calculated_column':
      return addCalculatedColumn(ctx.configManager, args);
    case 'add_conditional_styling_rule':
      return addConditionalStylingRule(ctx.configManager, args);
    case 'set_column_style':
      return setColumnStyle(ctx.configManager, args);
    default:
      return { ok: false, summary: `Unknown tool "${name}".` };
  }
}

export async function dispatchTool(
  name: ToolName,
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  console.debug(`${LOG} tool → ${name}`, args);
  try {
    const result = await runTool(name, ctx, args);
    console.debug(`${LOG} tool ← ${name}`, result);
    return result;
  } catch (err) {
    console.error(`${LOG} tool âœ— ${name}`, err);
    throw err;
  }
}

export function useToolExecutor() {
  const { platform, config } = usePlatformBootstrap();
  const { configManager } = platform;
  const appId = config.appId;
  // `<DataHubProvider>` (mounted by main.tsx's FullGate, which wraps this
  // route) builds this store over the same ConfigManager and wires worker
  // catalog invalidation, so a provider created here is picked up live.
  const { configStore } = useDataServices();

  const executeTool = useCallback(
    (name: ToolName, args: Record<string, unknown>): Promise<ToolExecutionResult> =>
      dispatchTool(name, { configManager, configStore, appId }, args),
    [configManager, configStore, appId],
  );

  return { executeTool };
}
