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
  readActiveProfile,
  patchGridModule,
  patchGridLevelData,
  listInstanceRows,
  describeFanOut,
  resolveGridEntry,
  BLOTTER_COMPONENT_TYPE,
  gridScopeId,
  withGridScope,
  resolveGridTarget,
  findGridByDisplayName,
} from './gridProfiles';
import type { RuleScope } from '@wellsfargo-starui/core';
import { normalizeRuleFeatures } from './ruleFeatures';
import { FEATURE_GUIDE_IDS, featureGuideForModule, findFeatureGuide } from './featureGuides';
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
import { openAnalysisWindow, createLiveReport, reloadAnalysisWindow } from './reportTools';
import {
  setColumnLayout,
  setRowGrouping,
  setSort,
  setFilterModel,
  setQuickFilter,
  setGroupExpansion,
} from './layoutTools';
import { renameColumn, setColumnVisibility } from './simpleColumnTools';
import { listMockDatasets, listProviderFields, inferProviderFields, setProviderColumns } from './providerFieldTools';
import { summarizeGridData, queryGridData } from './dataTools';
import type { DataHubClient } from './dataAccess';
import { setColumnStyle, setColumnBehavior } from './columnStyleTools';
import {
  listGrids,
  createBlotter,
  openBlotter,
  renameBlotter,
  deleteBlotter,
  setGridProvider,
  listGridInstances,
} from './blotterTools';
import { knownColumnIds } from './columnCatalog';
import { diagnose, summariseFindings } from './diagnostics';
import { CELL_RENDERERS } from './cellRenderers';
import {
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  switchProfile,
  reloadGrid,
} from './profileTools';
import {
  listDataProviders,
  getGridColumns,
  describeDataFields,
  createDataProvider,
  updateDataProvider,
  deleteDataProvider,
} from './providerTools';
import type { ColumnDefinition, MockProviderConfig } from '@wellsfargo-starui/types';
import type { ToolName } from './tools';
import type { ToolExecutionResult } from './toolResult';

export type { ToolExecutionResult };

const LOG = '[aiAssistant]';

/** Registered MarketsGrid blotters all share this route. */
const BLOTTER_HOST_URL = '/#/blotters/marketsgrid';
function listGridModules(): ToolExecutionResult {
  return {
    ok: true,
    summary: GRID_MODULES.map((m) => m.id).join(', '),
    data: {
      modules: GRID_MODULES.map((m) => {
        const collections = collectionsForModule(m.id);
        const guideId = featureGuideForModule(m.id);
        return {
          ...m,
          // Advertised inline so the model doesn't have to guess which modules
          // have a worked example, or which hold individually addressable items.
          // Names the guide rather than just asserting one exists — several
          // modules are documented by a guide under a different id (the five
          // editing modules all live in `editing`), and the model needs the id
          // it should actually pass to get_feature_guide.
          hasFeatureGuide: guideId !== undefined,
          ...(guideId ? { featureGuide: guideId } : {}),
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

  const profile = await readActiveProfile(configManager, gridScopeId(entry));
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
    // No "reopen to see it" — a module write lands in the row the open grid is
    // reading, and its live config sync re-applies it without a reload.
    summary: `Set ${keys.join(', ')} on "${entry.displayName}"${describeFanOut(fan)} (${a.moduleId}).`,
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

  const profile = await readActiveProfile(configManager, gridScopeId(entry));
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
  const existing = await readActiveProfile(configManager, gridScopeId(entry));
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





/**
 * Gathers the state `diagnose()` reasons over. Read-only: it never fixes
 * anything, it explains — the user decides what to change.
 */
async function diagnoseGrid(
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
  const providerId = gridLevelData?.provider?.liveProviderId ?? null;
  const providerRow = providerId ? await configStore.get(providerId) : null;
  const providerConfig = providerRow?.config as
    | { providerType?: string; columnDefinitions?: unknown[]; keyColumn?: unknown }
    | undefined;

  const profile = await readActiveProfile(configManager, gridScopeId(entry));
  const assignments = ((profile.state['column-customization']?.data as {
    assignments?: Record<string, { initialHide?: boolean }>;
  })?.assignments) ?? {};
  const savedGridState = (profile.state['grid-state']?.data as {
    saved?: {
      gridState?: {
        columnVisibility?: { hiddenColIds?: string[] };
        rowGroup?: { groupColIds?: string[] };
        pivot?: { pivotMode?: boolean; pivotColIds?: string[] };
      };
      assistantAutoHiddenColIds?: string[];
    };
  })?.saved;
  const gridState = savedGridState?.gridState;

  const hiddenColumns = [
    ...new Set([
      ...Object.entries(assignments).filter(([, a]) => a?.initialHide === true).map(([colId]) => colId),
      ...(gridState?.columnVisibility?.hiddenColIds ?? []),
    ]),
  ];

  const findings = diagnose({
    gridName: entry.displayName,
    providerId,
    provider: providerRow
      ? {
          name: providerRow.name,
          providerType: providerConfig?.providerType,
          columnDefinitions: providerConfig?.columnDefinitions,
          keyColumn: providerConfig?.keyColumn,
        }
      : null,
    knownColumns: await knownColumnIds(configManager, configStore, entry),
    hiddenColumns,
    conditionalRules: ((profile.state['conditional-styling']?.data as { rules?: Array<{ id: string; name?: string; enabled?: boolean; expression?: string }> })?.rules) ?? [],
    calculatedColumns: ((profile.state['calculated-columns']?.data as { virtualColumns?: Array<{ colId?: string; expression?: string }> })?.virtualColumns) ?? [],
    rowGroupColIds: gridState?.rowGroup?.groupColIds ?? [],
    pivotColIds: gridState?.pivot?.pivotColIds ?? [],
    pivotMode: gridState?.pivot?.pivotMode === true,
    autoHiddenColIds: savedGridState?.assistantAutoHiddenColIds ?? [],
  });

  return { ok: true, summary: summariseFindings(entry.displayName, findings), data: { findings } };
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


export interface ToolExecutionContext {
  configManager: ConfigManager;
  /** ConfigManager-backed provider store (from `<DataHubProvider>`). NOT the
   *  legacy `dataProviderConfigService`, which defaults to REST mode and
   *  would POST to a config server that isn't running locally. */
  configStore: DataProviderConfigStore;
  /**
   * SharedWorker data-hub client, for the tools that read actual rows. The
   * assistant window is inside `<DataHubProvider>`, so this is the same hub the
   * open blotters are attached to — a snapshot for a running provider is a
   * cache replay of the rows on screen, not a fresh upstream fetch.
   * Optional: absent in tests, and the data tools say so rather than throwing.
   */
  client?: DataHubClient;
  /** Deployment app id — stamped onto registry entries created here. */
  appId: string;
  /**
   * Grid the user has selected in the panel. Filled in when a call omits
   * `targetGridId`, so "hide the ISIN column" works without naming a grid.
   * Never overrides an explicit argument.
   */
  defaultGridId?: string;
  /**
   * Set when the panel is scoped to one blotter (the wand button). Enforced
   * here rather than only asked of the model in the prompt: an instruction a
   * model can ignore is not a boundary.
   */
  lockedGridId?: string;
  /**
   * The blotter WINDOW this panel was opened from (the wand button). This is
   * `dispatchTool`'s default pin: a call that doesn't name its own instance
   * gets pinned to this one, so reads and writes stay on this window alone —
   * never the template, never a sibling window. A call CAN still override it
   * by naming a different `instanceId` explicitly (see `resolveInstancePin`),
   * which is how "also do this on the other window" works from a scoped panel.
   */
  focusInstanceId?: string;
}

/**
 * Applies panel scope to one call. Returns a refusal when the call reaches
 * outside a locked panel, otherwise the args to run with.
 */
export function applyGridScope(
  ctx: Pick<ToolExecutionContext, 'defaultGridId' | 'lockedGridId'>,
  args: Record<string, unknown>,
): { ok: true; args: Record<string, unknown> } | { ok: false; summary: string } {
  const requested = args.targetGridId;
  if (ctx.lockedGridId && typeof requested === 'string' && requested && requested !== ctx.lockedGridId) {
    return {
      ok: false,
      summary:
        `This assistant is scoped to "${ctx.lockedGridId}" and can't act on "${requested}". ` +
        'Tell the user to open the assistant from that blotter\'s toolbar instead.',
    };
  }
  const fallback = ctx.lockedGridId ?? ctx.defaultGridId;
  if (!requested && fallback) return { ok: true, args: { ...args, targetGridId: fallback } };
  return { ok: true, args };
}

export type InstancePin =
  | { ok: true; args: Record<string, unknown>; pinnedInstanceId?: string }
  | { ok: false; summary: string };

/**
 * Normalises whichever id the model supplied into (blotter, window).
 *
 * Two ways to name a window, because both arise naturally:
 *  - `instanceId` alongside `targetGridId` — "that one, of this blotter";
 *  - `targetGridId` that is *itself* an instance id — which is what a model
 *    does after `list_grid_instances`, since that tool returns instance ids and
 *    nothing said they weren't interchangeable.
 *
 * Runs before the scope lock so the lock is enforced against the blotter the id
 * actually belongs to, not the raw string.
 */
export async function resolveInstancePin(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<InstancePin> {
  const targetGridId = typeof args.targetGridId === 'string' ? args.targetGridId : undefined;
  const instanceId = typeof args.instanceId === 'string' && args.instanceId ? args.instanceId : undefined;
  if (!targetGridId) return { ok: true, args };

  const target = await resolveGridTarget(configManager, targetGridId);
  if (!target) {
    // The one mistake worth catching here rather than in each handler: a
    // DISPLAY NAME where a configId belongs. Names are not identifiers —
    // they can be renamed and duplicated — so the call is refused with the
    // real configId, which is what the model needs to try again correctly.
    const byName = await findGridByDisplayName(targetGridId);
    if (byName) {
      return {
        ok: false,
        summary:
          `"${targetGridId}" is a display name, not a configId. Use targetGridId "${byName.configId}" ` +
          '(copy it exactly from list_grids — never derive an id from a name).',
      };
    }
    // Otherwise left alone: the handlers produce the "no grid with id X"
    // message, and duplicating it here would make one mistake read two ways.
    return { ok: true, args };
  }
  // Every handler downstream sees the configId — the template row's id —
  // whatever form the caller used (registry id, instance id, configId).
  const normalised = { ...args, targetGridId: target.entry.configId };

  if (!instanceId) return { ok: true, args: normalised, pinnedInstanceId: target.pinnedInstanceId };

  // An explicit instanceId must belong to the blotter it was passed with,
  // otherwise a typo silently rewrites a different window's config.
  const owner = await resolveGridTarget(configManager, instanceId);
  if (!owner) {
    return {
      ok: false,
      summary: `No window with instance id "${instanceId}". Call list_grid_instances for "${target.entry.id}" to see its open windows.`,
    };
  }
  if (owner.entry.id !== target.entry.id) {
    return {
      ok: false,
      summary: `Instance "${instanceId}" belongs to "${owner.entry.displayName}", not "${target.entry.displayName}".`,
    };
  }
  // A singleton's window IS the template row, so there is nothing to narrow to.
  return { ok: true, args: normalised, pinnedInstanceId: owner.pinnedInstanceId ?? undefined };
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
    case 'list_cell_renderers':
      return {
        ok: true,
        summary: CELL_RENDERERS.map((r) => r.id).join(', '),
        data: CELL_RENDERERS,
      };
    case 'summarize_grid_data':
      return summarizeGridData({ configManager: ctx.configManager, configStore: ctx.configStore, client: ctx.client }, args);
    case 'query_grid_data':
      return queryGridData({ configManager: ctx.configManager, configStore: ctx.configStore, client: ctx.client }, args);
    case 'diagnose_grid':
      return diagnoseGrid(ctx.configManager, ctx.configStore, args);
    case 'list_mock_datasets':
      return listMockDatasets();
    case 'list_provider_fields':
      return listProviderFields(ctx.configStore, args);
    case 'infer_provider_fields':
      return inferProviderFields(ctx.configStore, args);
    case 'set_provider_columns':
      return setProviderColumns(ctx.configManager, ctx.configStore, args);
    case 'describe_data_fields':
      return describeDataFields(ctx.configStore, args);
    case 'rename_column':
      return renameColumn(ctx.configManager, ctx.configStore, args);
    case 'set_column_visibility':
      return setColumnVisibility(ctx.configManager, ctx.configStore, args);
    case 'set_column_layout':
      return setColumnLayout(ctx.configManager, ctx.configStore, args);
    case 'set_row_grouping':
      return setRowGrouping(ctx.configManager, ctx.configStore, args);
    case 'set_sort':
      return setSort(ctx.configManager, ctx.configStore, args);
    case 'set_filter_model':
      return setFilterModel(ctx.configManager, args);
    case 'set_quick_filter':
      return setQuickFilter(ctx.configManager, args);
    case 'set_group_expansion':
      return setGroupExpansion(ctx.configManager, args);
    case 'list_profiles':
      return listProfiles(ctx.configManager, args);
    case 'create_profile':
      return createProfile(ctx.configManager, args);
    case 'update_profile':
      return updateProfile(ctx.configManager, args);
    case 'delete_profile':
      return deleteProfile(ctx.configManager, args);
    case 'switch_profile':
      return switchProfile(ctx.configManager, args);
    case 'reload_grid':
      return reloadGrid(ctx.configManager, args);
    case 'create_blotter':
      return createBlotter(ctx.configManager, ctx.appId, args);
    case 'open_blotter':
      return openBlotter(args);
    case 'open_analysis_window':
      return openAnalysisWindow({ configManager: ctx.configManager, configStore: ctx.configStore }, args);
    case 'create_live_report':
      return createLiveReport({ configManager: ctx.configManager, configStore: ctx.configStore }, args);
    case 'reload_analysis_window':
      return reloadAnalysisWindow({ configManager: ctx.configManager, configStore: ctx.configStore }, args);
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
      return updateDataProvider(ctx.configManager, ctx.configStore, args);
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
      return setColumnStyle(ctx.configManager, ctx.configStore, args);
    case 'set_column_behavior':
      return setColumnBehavior(ctx.configManager, ctx.configStore, args);
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
  // Resolve first: an id that names a window has to become (blotter, window)
  // before the lock can judge which blotter it is.
  const pinned = await resolveInstancePin(ctx.configManager, args);
  if (!pinned.ok) {
    console.debug(`${LOG} tool ✗ ${name} — ${pinned.summary}`);
    return { ok: false, summary: pinned.summary };
  }
  const scoped = applyGridScope(ctx, pinned.args);
  if (!scoped.ok) {
    console.debug(`${LOG} tool ✗ ${name} — out of scope`);
    return { ok: false, summary: scoped.summary };
  }
  try {
    const result = await withGridScope(
      // A call that doesn't pin anything of its own defaults to the window
      // this panel is focused on — that's what turns a wand-scoped session's
      // ordinary, unpinned calls into "this window alone", not "template +
      // this window". An explicit pin from the call itself still wins.
      { focusInstanceId: ctx.focusInstanceId, pinnedInstanceId: pinned.pinnedInstanceId ?? ctx.focusInstanceId },
      () => runTool(name, ctx, scoped.args),
    );
    console.debug(`${LOG} tool ← ${name}`, result);
    return result;
  } catch (err) {
    console.error(`${LOG} tool ✗ ${name}`, err);
    throw err;
  }
}

export interface UseToolExecutorOptions {
  /** Grid selected in the panel; used when a call omits `targetGridId`. */
  defaultGridId?: string;
  /** Set by a wand-launched panel — calls may not reach any other grid. */
  lockedGridId?: string;
  /** The blotter window this panel was opened from; the default pin for any call that doesn't name its own instance. */
  focusInstanceId?: string;
}

export function useToolExecutor(options: UseToolExecutorOptions = {}) {
  const { platform, config } = usePlatformBootstrap();
  const { configManager } = platform;
  const appId = config.appId;
  // `<DataHubProvider>` (mounted by main.tsx's FullGate, which wraps this
  // route) builds this store over the same ConfigManager and wires worker
  // catalog invalidation, so a provider created here is picked up live.
  const { configStore, client } = useDataServices();
  const { defaultGridId, lockedGridId, focusInstanceId } = options;

  const executeTool = useCallback(
    (name: ToolName, args: Record<string, unknown>): Promise<ToolExecutionResult> =>
      dispatchTool(
        name,
        { configManager, configStore, client: client as DataHubClient | undefined, appId, defaultGridId, lockedGridId, focusInstanceId },
        args,
      ),
    [configManager, configStore, client, appId, defaultGridId, lockedGridId, focusInstanceId],
  );

  return { executeTool };
}
