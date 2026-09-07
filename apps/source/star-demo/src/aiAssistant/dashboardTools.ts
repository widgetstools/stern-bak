/**
 * Dashboards that outlive the window that made them.
 *
 * `create_live_report` opens an analysis window from a handoff written to
 * `localStorage` with a ten-minute TTL. That is right for "show me this now"
 * and useless for "keep this" — close the window and the dashboard is gone,
 * with no link to come back to.
 *
 * A saved dashboard is three ordinary things the platform already does:
 *
 *  1. the `ReportSpec` persisted as its own config row, so it survives;
 *  2. a Component Registry entry whose `hostUrl` carries `?dashboard=<id>`, so
 *     the existing launcher opens it like any other component — no new launch
 *     path, no new window plumbing;
 *  3. a dock button filed under **Assets → Dashboards**, using the nested
 *     sub-menu `DockMenuItemConfig.options` has always supported.
 *
 * Nothing here is a new mechanism. That is the point: a dashboard becomes a
 * component, and everything that already works for components works for it.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { validateReportSpec, type ReportSpec } from '@wellsfargo-starui/data';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import { deriveTemplateConfigId } from '@wellsfargo-starui/openfin/config';
import {
  addRegistryEntry,
  addDockButton,
  buildRegistryEntry,
  registryEntryExists,
  removeRegistryEntry,
  removeDockButtons,
  BLOTTER_DOCK_GROUP,
} from './registryOps';
import { launchBlotter, describeLaunch } from './launchComponent';
import { resolveGridEntry } from './gridProfiles';
import { preflightReport, describeBroken, describeEmpty, type PreflightDeps } from './reportPreflight';
import type { ToolExecutionResult } from './toolResult';

/** Its own componentType, so a dashboard never appears in a blotter listing. */
export const DASHBOARD_COMPONENT_TYPE = 'dashboard';
/** The sub-menu under Assets. */
export const DASHBOARD_DOCK_SUBGROUP = 'Dashboards';
const DASHBOARD_ROUTE = '/#/analysis';

function toSubType(displayName: string): string {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dashboard';
}

/** Config row holding the spec. Separate from the registry entry, which holds
 *  only how to launch it. */
function dashboardConfigId(id: string): string {
  return `dashboard-spec::${id}`;
}

/**
 * What a saved dashboard stores.
 *
 * The spec alone was not enough: a dashboard opened from the dock arrives with
 * no blotter in its URL, so the window could not resolve WHICH grid to read
 * and rendered nothing at all. The source is part of the dashboard, so it is
 * saved with it.
 */
interface StoredDashboard {
  v: 1;
  /** The blotter configId whose rows this dashboard reads. */
  gridId: string;
  spec: ReportSpec;
}

export interface LoadedDashboard {
  gridId: string;
  spec: ReportSpec;
}

export async function readDashboard(
  configManager: ConfigManager,
  id: string,
): Promise<LoadedDashboard | null> {
  const row = await configManager.getConfig(dashboardConfigId(id));
  if (!row) return null;
  const stored = row.payload as unknown as Partial<StoredDashboard> | null;
  // Revalidated rather than trusted: it was written by another window and may
  // be from an older build — the same posture `Analysis.tsx` takes for a
  // spec arriving through storage.
  const outcome = validateReportSpec(stored?.spec);
  if (!outcome.ok || !stored?.gridId) return null;
  return { gridId: stored.gridId, spec: outcome.value };
}

/** @deprecated Prefer {@link readDashboard} — the spec alone cannot say which
 *  blotter it reads, which is what left a dock-opened dashboard empty. */
export async function readDashboardSpec(
  configManager: ConfigManager,
  id: string,
): Promise<ReportSpec | null> {
  return (await readDashboard(configManager, id))?.spec ?? null;
}

/**
 * Write a rearranged layout back to a saved dashboard.
 *
 * Only the blocks change: everything else about the dashboard — its title,
 * cadence, the queries each block runs — is left exactly as it was, because
 * moving a card is not a licence to rewrite the report.
 */
export async function saveDashboardLayout(
  configManager: ConfigManager,
  id: string,
  dock: ReportSpec['dock'],
): Promise<boolean> {
  const row = await configManager.getConfig(dashboardConfigId(id));
  if (!row) return false;
  const stored = row.payload as unknown as StoredDashboard;
  const outcome = validateReportSpec({ ...stored.spec, dock });
  if (!outcome.ok) {
    console.warn('[dashboard] rearranged layout failed validation, not saved:', outcome.error);
    return false;
  }
  await configManager.saveConfig({
    ...row,
    payload: { ...stored, spec: outcome.value } as unknown as Record<string, unknown>,
    updatedBy: LOGGED_IN_USER_ID,
    updatedTime: new Date().toISOString(),
  });
  return true;
}

export async function saveDashboard(
  deps: PreflightDeps,
  appId: string,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const configManager = deps.configManager;
  const a = args as { name?: string; spec?: unknown; targetGridId?: string; addToDock?: boolean; openNow?: boolean };
  if (!a.name) return { ok: false, summary: 'Missing required field: name — what to call the dashboard, e.g. "Trader Dashboard".' };
  if (!a.spec) return { ok: false, summary: 'Missing required field: spec — the same report spec create_live_report takes.' };
  // Required, and checked: a dashboard opened from the dock carries no blotter
  // in its URL, so without this it has no rows to draw and renders empty.
  if (!a.targetGridId) {
    return { ok: false, summary: 'Missing required field: targetGridId — the blotter this dashboard reads. Without it the saved dashboard opens with no data.' };
  }
  const sourceGrid = await resolveGridEntry(a.targetGridId);
  if (!sourceGrid) {
    return { ok: false, summary: `No grid registered with id "${a.targetGridId}". Call list_grids to see valid ids.` };
  }

  const outcome = validateReportSpec(a.spec);
  if (!outcome.ok) return { ok: false, summary: outcome.error };

  // A SAVED dashboard is worse to get wrong than an ad-hoc report: it goes on
  // the dock and is opened again tomorrow. So the same preflight applies, and
  // a block that can never draw stops the save rather than being discovered
  // later by whoever opens it.
  const flight = await preflightReport(deps, sourceGrid, outcome.value);
  if (flight.ok && flight.value.broken.length > 0) {
    return {
      ok: false,
      summary:
        `Not saved — ${flight.value.broken.length} of ${outcome.value.blocks.length} block(s) would render nothing: ` +
        `${describeBroken(flight.value.broken)}. ` +
        'Fix those blocks and call again; call get_grid_columns if you need the real column names.',
    };
  }
  const emptyNote =
    flight.ok && flight.value.empty.length > 0
      ? ` ${flight.value.empty.length} block(s) match no rows right now (${describeEmpty(flight.value.empty)}).`
      : '';

  const componentSubType = toSubType(a.name);
  const id = deriveTemplateConfigId(DASHBOARD_COMPONENT_TYPE, componentSubType);
  if (await registryEntryExists(id)) {
    return { ok: false, summary: `A dashboard with id "${id}" already exists — pick a different name, or delete that one first.` };
  }

  const now = new Date().toISOString();
  await configManager.saveConfig({
    configId: dashboardConfigId(id),
    appId,
    userId: LOGGED_IN_USER_ID,
    isPublic: true,
    displayText: `Dashboard: ${a.name}`,
    componentType: DASHBOARD_COMPONENT_TYPE,
    componentSubType,
    isTemplate: true,
    singleton: true,
    payload: { v: 1, gridId: sourceGrid.configId, spec: outcome.value } as unknown as Record<string, unknown>,
    createdBy: LOGGED_IN_USER_ID,
    updatedBy: LOGGED_IN_USER_ID,
    creationTime: now,
    updatedTime: now,
  });

  // The registry entry is just "how to open it". `?dashboard=<id>` is what the
  // analysis route reads instead of a handoff, so the dashboard is restored
  // from its saved spec rather than from a ten-minute localStorage key.
  await addRegistryEntry(
    buildRegistryEntry({
      id,
      hostUrl: `${DASHBOARD_ROUTE}?dashboard=${encodeURIComponent(id)}&grid=${encodeURIComponent(sourceGrid.configId)}`,
      displayName: a.name,
      componentType: DASHBOARD_COMPONENT_TYPE,
      componentSubType,
      configId: id,
      iconId: 'lucide:layout-dashboard',
      appId,
      singleton: true,
      asWindow: true,
    }),
  );

  const wantDock = a.addToDock ?? true;
  const addedToDock = wantDock
    ? await addDockButton({
        registryEntryId: id,
        tooltip: a.name,
        iconId: 'lucide:layout-dashboard',
        asWindow: true,
        group: BLOTTER_DOCK_GROUP,
        subGroup: DASHBOARD_DOCK_SUBGROUP,
      })
    : false;

  const launch = (a.openNow ?? true) ? await launchBlotter(id, true) : null;

  return {
    ok: true,
    summary:
      `Saved dashboard "${a.name}" (id=${id}).` +
      emptyNote +
      (addedToDock
        ? ` Filed on the dock under ${BLOTTER_DOCK_GROUP} → ${DASHBOARD_DOCK_SUBGROUP} → ${a.name}, so it reopens from there.`
        : wantDock
          ? ' (no dock button — this platform has no saved dock config yet; add one from Workspace Setup)'
          : '') +
      (launch ? describeLaunch(launch, a.name) : ''),
    data: { id, name: a.name, dockPath: `${BLOTTER_DOCK_GROUP}/${DASHBOARD_DOCK_SUBGROUP}/${a.name}` },
  };
}

export async function listDashboards(configManager: ConfigManager): Promise<ToolExecutionResult> {
  const rows = await configManager.findByComponentType(DASHBOARD_COMPONENT_TYPE, '');
  const all = rows.length
    ? rows
    : (await configManager.getConfigsByUser(LOGGED_IN_USER_ID)).filter(
        (r) => r.componentType === DASHBOARD_COMPONENT_TYPE,
      );
  const saved = all.filter((r) => r.configId.startsWith('dashboard-spec::'));
  if (saved.length === 0) {
    return { ok: true, summary: 'No dashboards saved yet. Build one with create_live_report, then keep it with save_dashboard.', data: [] };
  }
  const listed = saved.map((r) => ({
    id: r.configId.slice('dashboard-spec::'.length),
    name: (r.payload as { spec?: { title?: string } } | null)?.spec?.title ?? r.displayText,
    updatedTime: r.updatedTime,
  }));
  return {
    ok: true,
    summary: listed.map((d) => `"${d.name}" (id=${d.id})`).join('; '),
    data: listed,
  };
}

export async function deleteDashboard(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const id = args.id as string | undefined;
  if (!id) return { ok: false, summary: 'Missing required field: id. Call list_dashboards to see them.' };
  if (!(await registryEntryExists(id))) {
    return { ok: false, summary: `No dashboard registered with id "${id}". Call list_dashboards.` };
  }
  // Dock button, registry entry and stored spec all go — leaving any one
  // behind gives a menu entry that opens an empty window.
  await removeDockButtons(id);
  await removeRegistryEntry(id);
  await configManager.deleteConfig(dashboardConfigId(id));
  return { ok: true, summary: `Deleted dashboard "${id}" and removed it from the dock.` };
}
