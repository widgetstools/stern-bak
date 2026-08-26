/**
 * Blotter lifecycle: listing, creating, opening, renaming, deleting, rebinding
 * its feed, and reporting its open windows.
 *
 * These touch the Component Registry and the dock rather than a grid's profile,
 * which is why none of them are undoable by a profile snapshot (see `undo.ts`).
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { loadRegistryConfig, deriveTemplateConfigId } from '@wellsfargo-starui/openfin/config';
import {
  resolveGridEntry,
  patchGridLevelData,
  listInstanceRows,
  describeFanOut,
  BLOTTER_COMPONENT_TYPE,
} from './gridProfiles';
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
import { launchBlotter, describeLaunch } from './launchComponent';
import type { ToolExecutionResult } from './toolResult';

/** Registered MarketsGrid blotters all share this route. */
const BLOTTER_HOST_URL = '/#/blotters/marketsgrid';

export async function listGrids(): Promise<ToolExecutionResult> {
  const registry = await loadRegistryConfig();
  const grids = (registry?.entries ?? []).filter((e) => e.componentType === BLOTTER_COMPONENT_TYPE);
  const summary =
    grids.map((g) => `${g.displayName} (id=${g.id})`).join('; ') ||
    'No grids are registered on the dock yet.';
  return { ok: true, summary, data: grids.map((g) => ({ id: g.id, displayName: g.displayName })) };
}

/** Slugifies a display name into a registry `componentSubType`. */
function toSubType(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'blotter';
}

export async function createBlotter(
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
export async function openBlotter(args: Record<string, unknown>): Promise<ToolExecutionResult> {
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

export async function renameBlotter(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; displayName?: string };
  if (!a.targetGridId || !a.displayName) return { ok: false, summary: 'Missing required field(s): targetGridId, displayName.' };
  const ok = await updateRegistryEntry(a.targetGridId, { displayName: a.displayName });
  if (!ok) return { ok: false, summary: `No grid registered with id "${a.targetGridId}".` };
  await renameDockButtons(a.targetGridId, a.displayName);
  return { ok: true, summary: `Renamed to "${a.displayName}" (its id stays ${a.targetGridId}).` };
}

export async function deleteBlotter(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; confirm?: boolean };
  if (!a.targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  // Enforced, not merely requested of the model: deleting a blotter removes it
  // from the dock for every user of this profile.
  if (a.confirm !== true) {
    const entry = await resolveGridEntry(a.targetGridId);
    const label = entry ? `"${entry.displayName}" (${a.targetGridId})` : `"${a.targetGridId}"`;
    return {
      ok: false,
      summary: `Deleting ${label} removes it from the dock. Ask the user to confirm, then call again with confirm: true.`,
    };
  }
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
export async function setGridProvider(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
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

/**
 * Reports the open instances of a blotter. The model needs this to explain
 * where a change landed — and to see when a window has drifted from the
 * template it was cloned from.
 */
export async function listGridInstances(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
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
