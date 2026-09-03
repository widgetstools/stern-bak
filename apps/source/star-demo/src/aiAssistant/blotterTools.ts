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
  BLOTTER_DOCK_GROUP,
} from './registryOps';
import { launchBlotter, describeLaunch, reloadOpenComponents, describeReload } from './launchComponent';
import type { ToolExecutionResult } from './toolResult';

/** Registered MarketsGrid blotters all share this route. */
const BLOTTER_HOST_URL = '/#/blotters/marketsgrid';

export async function listGrids(): Promise<ToolExecutionResult> {
  const registry = await loadRegistryConfig();
  const grids = (registry?.entries ?? []).filter((e) => e.componentType === BLOTTER_COMPONENT_TYPE);
  // The configId is THE identifier — copy it exactly. The display name is
  // shown so the model can match what the user said to a row, never so it
  // can be passed back as an id.
  const summary =
    grids.map((g) => `${g.displayName} (configId=${g.configId})`).join('; ') ||
    'No grids are registered on the dock yet.';
  return {
    ok: true,
    summary,
    data: grids.map((g) => ({ configId: g.configId, displayName: g.displayName, singleton: g.singleton === true })),
  };
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
    dockGroup?: string;
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
  // Registered SINGLETON, which is what makes this a template-backed
  // component rather than a factory for throwaway copies:
  //
  //   • the launcher skips the template→instance clone, so the window's own
  //     config row IS the template (`launch.ts`: "instanceId === templateId,
  //     the view IS the template"). Every edit the assistant makes therefore
  //     lands on the template config, and survives closing the window;
  //   • because the assistant writes the row the window is reading, its live
  //     config sync re-applies the change with no reload;
  //   • re-launching focuses the window that is already open instead of
  //     spawning a second copy that would drift from the first.
  //
  // The trade-off is real and intended: one window per blotter. Two windows of
  // one blotter would each own a cloned row, which is exactly the drift this
  // avoids — a user who wants a second view makes a second blotter.
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
      singleton: true,
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
    singleton: true,
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

  // Blotters are filed under one dropdown ("Assets") rather than each taking a
  // top-level slot — a dock that grows a button per blotter stops being
  // navigable fast. `dockGroup: ''` opts back out to a top-level button.
  const wantDock = a.addToDock ?? true;
  const group = a.dockGroup === undefined ? BLOTTER_DOCK_GROUP : a.dockGroup.trim();
  const addedToDock = wantDock
    ? await addDockButton({
        registryEntryId: id,
        tooltip: a.displayName,
        iconId: 'lucide:table',
        asWindow,
        ...(group ? { group } : null),
      })
    : false;

  // Show it, don't just register it — a blotter the user has to go hunting
  // for on the dock isn't really "created" from their point of view.
  const launch = (a.openNow ?? true) ? await launchBlotter(id, asWindow) : null;

  return {
    ok: true,
    summary:
      `Created blotter "${a.displayName}" (configId=${id} — use this exact id for every call about it)` +
      (addedToDock
        ? group
          ? ` and filed it under the "${group}" menu on the dock`
          : ' and added a dock button for it'
        : wantDock
          ? ' (no dock button — this platform has no saved dock config yet; add one from Workspace Setup)'
          : '') +
      (a.providerId ? `, bound to provider ${a.providerId}` : ', with no data provider bound yet') +
      '.' +
      (launch ? describeLaunch(launch, a.displayName) : ''),
    data: { configId: id, displayName: a.displayName, opened: launch?.ok ?? false },
  };
}

/**
 * Reloads the open windows of every blotter bound to `providerId`.
 *
 * A provider edit (its column set, its connection) reaches the grid only when
 * the container next mounts, and the change is made on the PROVIDER, so there
 * is no single blotter to reload — the bindings have to be walked backwards.
 *
 * Bindings are read from each blotter's template row, which is the component's
 * definition and — for a singleton — the very row its window reads. An older
 * multi-instance blotter can in principle carry a different binding on one
 * window's row; the template is still the right question to ask, since that is
 * what `set_grid_provider` writes.
 */
export async function reloadBlottersUsingProvider(
  configManager: ConfigManager,
  providerId: string,
): Promise<number> {
  const registry = await loadRegistryConfig();
  const grids = (registry?.entries ?? []).filter((e) => e.componentType === BLOTTER_COMPONENT_TYPE);
  let reloaded = 0;
  for (const grid of grids) {
    try {
      const gridLevelData = (await configManager.profiles.loadGridLevelData({ instanceId: grid.configId })) as
        | { provider?: { liveProviderId?: string | null; historicalProviderId?: string | null } }
        | null;
      const bindings = [
        gridLevelData?.provider?.liveProviderId,
        gridLevelData?.provider?.historicalProviderId,
      ];
      if (!bindings.includes(providerId)) continue;
      reloaded += await reloadOpenComponents(grid.id);
    } catch (err) {
      // One unreadable row must not stop the rest from refreshing.
      console.debug(`[aiAssistant] could not check provider binding for "${grid.id}":`, err);
    }
  }
  return reloaded;
}

/** Opens an already-registered blotter — "show me the axe blotter". */
export async function openBlotter(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const asWindow = (args.asWindow as boolean | undefined) ?? entry.asWindow ?? true;
  const launch = await launchBlotter(entry.id, asWindow);
  // A singleton is focused rather than re-opened, so saying "opened" would
  // mislead a user who expected a second window and got the first one raised.
  return launch.ok
    ? {
        ok: true,
        summary: entry.singleton
          ? `Brought "${entry.displayName}" to the front (one window per blotter — re-opening focuses it rather than making a copy).`
          : `Opened "${entry.displayName}".`,
      }
    : { ok: false, summary: describeLaunch(launch, entry.displayName).trim() };
}

export async function renameBlotter(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; displayName?: string };
  if (!a.targetGridId || !a.displayName) return { ok: false, summary: 'Missing required field(s): targetGridId, displayName.' };
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with configId "${a.targetGridId}". Call list_grids to see valid ids.` };
  // Registry ops key on the entry's own `id`; the caller keyed on configId.
  const ok = await updateRegistryEntry(entry.id, { displayName: a.displayName });
  if (!ok) return { ok: false, summary: `No grid registered with configId "${a.targetGridId}".` };
  await renameDockButtons(entry.id, a.displayName);
  return {
    ok: true,
    summary: `Renamed to "${a.displayName}" — its configId is still ${entry.configId}; keep using that, not the new name.`,
  };
}

export async function deleteBlotter(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; confirm?: boolean };
  if (!a.targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(a.targetGridId);
  // Enforced, not merely requested of the model: deleting a blotter removes it
  // from the dock for every user of this profile.
  if (a.confirm !== true) {
    const label = entry ? `"${entry.displayName}" (configId ${entry.configId})` : `"${a.targetGridId}"`;
    return {
      ok: false,
      summary: `Deleting ${label} removes it from the dock. Ask the user to confirm, then call again with confirm: true.`,
    };
  }
  if (!entry) return { ok: false, summary: `No grid registered with configId "${a.targetGridId}". Call list_grids to see valid ids.` };
  const removed = await removeRegistryEntry(entry.id);
  if (!removed) return { ok: false, summary: `No grid registered with configId "${a.targetGridId}".` };
  // Always drop the buttons too — a button pointing at a deleted entry is a
  // dead dock item that warns and no-ops on click.
  const buttons = await removeDockButtons(entry.id);
  return {
    ok: true,
    summary:
      `Deleted blotter "${entry.displayName}" (configId ${entry.configId})${buttons > 0 ? ` and removed ${buttons} dock button(s)` : ''}. ` +
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
  // The provider BINDING is read once when the container mounts, so unlike a
  // profile edit it cannot be re-applied live. Reload the windows the user
  // already has rather than asking them to reopen the blotter.
  const reloaded = await reloadOpenComponents(entry.id);
  return {
    ok: true,
    summary:
      `Bound "${entry.displayName}"${describeFanOut(fan)} to provider ${a.providerId} (${mode}).` +
      describeReload(reloaded),
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
