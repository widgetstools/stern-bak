/**
 * Workspace-membership-driven GC for orphaned per-instance config rows.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  DELETION IS CURRENTLY DISABLED                                  │
 * │                                                                  │
 * │  Repeated false-positive deletions (registry scope mismatches,   │
 * │  pre-flag rows, race conditions on first save) made this sweep   │
 * │  unsafe to leave armed. The sweep still RUNS and still computes  │
 * │  which rows it WOULD have reaped — that count is reported as     │
 * │  `result.wouldDelete` so we keep telemetry — but no              │
 * │  `cm.deleteConfig()` call is issued.                             │
 * │                                                                  │
 * │  Re-enable by flipping `DELETION_ENABLED` to `true` once the     │
 * │  preservation rules have been audited end-to-end against real    │
 * │  user databases. Until then, IndexedDB just accumulates orphan   │
 * │  rows — costs a few KB per stale instance, no functional impact. │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * The intended rule (when re-enabled): per-instance clones are ephemeral
 * until claimed by a saved workspace; everything that represents a
 * registered component (singleton row, non-singleton template) is
 * permanent and never reaped.
 *
 * Preservation rules (any one is enough to keep a row):
 *   1. componentType === 'workspace'           — workspace rows themselves
 *   2. isTemplate === true                     — registered-component
 *                                                templates (the sole
 *                                                canonical "this is a
 *                                                registered-component
 *                                                config" signal post-Session-16)
 *   3. configId in WELL_KNOWN_SHARED_IDS       — admin/system rows
 *                                                (dock, registry, ws-setup)
 *   4. configId === deriveSingletonConfigId(componentType, componentSubType)
 *                                              — self-describing fallback for
 *                                                pre-flag rows; protects existing
 *                                                singleton rows that haven't
 *                                                been re-saved yet
 *   5. configId in singletonKeys (registry)    — entry-driven catch for
 *                                                custom configIds that don't
 *                                                match the canonical derivation
 *   6. configId referenced by some saved workspace's instanceIds
 *
 * Rules 2, 4, and 5 are layered defenses for the same intent — "registered
 * components are protected." The `isTemplate` flag (rule 2) is the canonical
 * signal going forward; rules 4–5 catch legacy rows and registries written
 * under unusual scopes.
 *
 * GC is wired to:
 *   • createSavedWorkspace / updateSavedWorkspace / deleteSavedWorkspace
 *     (via onWorkspaceChange in workspace-persistence.ts)
 *   • app start (via initWorkspace bootstrap)
 */

/**
 * Master switch for GC deletion. Currently OFF — see file header for why.
 * Set to `true` to re-enable destructive sweeps once preservation rules
 * are trusted end-to-end.
 */
const DELETION_ENABLED = false;

import type { ConfigManager, AppConfigRow } from '@wellsfargo-starui/host-config';
import { COMPONENT_TYPES } from '@wellsfargo-starui/types';
import { deriveSingletonConfigId } from './registryConfigTypes';
import { loadRegistryConfig } from './db';

interface RegistryEntryLite {
  configId?: string;
  singleton?: boolean;
}

/**
 * Config rows whose configId is fixed and globally meaningful (not a
 * per-instance UUID). Never reap these even if no workspace references
 * them. Extend as new well-known rows are added.
 */
const WELL_KNOWN_SHARED_CONFIG_IDS: ReadonlySet<string> = new Set<string>([
  'dock-config',
  'component-registry',
  'workspace-setup',
]);

function singletonKeysFromRegistryEntries(
  entries: RegistryEntryLite[] | undefined,
): Set<string> {
  const keys = new Set<string>();
  if (!entries) return keys;
  for (const e of entries) {
    // Singleton lifecycle entries reuse the same configId every launch
    // (deriveSingletonConfigId writes it onto the entry at save time);
    // protect that exact id from GC. Templates also live at the entry's
    // configId but are protected separately by the isTemplate=true rule.
    if (e?.singleton && e?.configId) keys.add(e.configId);
  }
  return keys;
}

/**
 * True when a row's configId equals the canonical derivation for its
 * componentType/componentSubType. This is the back-compat signal for
 * rows written before any explicit registered-component flag existed —
 * those rows have no flag, but their configId IS the derived singleton
 * id, so we can identify them by shape alone.
 */
function isSingletonShape(row: AppConfigRow): boolean {
  if (!row.componentType) return false;
  const expected = deriveSingletonConfigId(
    row.componentType,
    row.componentSubType ?? '',
  );
  return row.configId === expected;
}

function instanceIdsFromWorkspaces(workspaces: AppConfigRow[]): Set<string> {
  const ids = new Set<string>();
  for (const ws of workspaces) {
    const payload = ws.payload as { instanceIds?: string[] } | undefined;
    for (const id of (payload?.instanceIds ?? [])) ids.add(id);
  }
  return ids;
}

export interface GcOptions {
  cm: ConfigManager;
  appId: string;
  userId: string;
  /** Default false. If true, log per-row decisions to console.debug. */
  verbose?: boolean;
}

export interface GcResult {
  scanned: number;
  /**
   * Rows actually removed from the store. Will be 0 while
   * `DELETION_ENABLED === false`. Kept on the result so external
   * logging / telemetry that already reads `r.deleted` keeps working.
   */
  deleted: number;
  /**
   * Rows that matched no preservation rule and would have been deleted
   * if `DELETION_ENABLED === true`. Equal to `deleted` when deletion is
   * armed; otherwise tracks the would-be-reaped count for visibility.
   */
  wouldDelete: number;
  preservedTemplate: number;
  preservedKnown: number;
  preservedSingleton: number;
  preservedSingletonShape: number;
  preservedReferenced: number;
}

/**
 * Sweep the (appId, userId) appConfig rows. Returns a count breakdown so
 * callers can log telemetry or surface results in admin tooling.
 *
 * Errors deleting individual rows are logged and counted as "kept" — the
 * sweep continues so a single broken row never blocks the rest.
 */
export async function gcOrphanedConfigs(opts: GcOptions): Promise<GcResult> {
  const { cm, appId, userId, verbose = false } = opts;

  // GC operates per-user across apps, then narrows to the requested
  // appId locally — bypass the visibility filter so cross-app rows
  // owned by this user reach the appId narrowing below.
  const allByUser = await cm.getConfigsByUserUnfiltered(userId);
  const inScope = allByUser.filter((r) => r.appId === appId);
  const workspaces = inScope.filter((r) => r.componentType === COMPONENT_TYPES.WORKSPACE);
  const referenced = instanceIdsFromWorkspaces(workspaces);

  // Load the registry through the canonical loader so scope resolution
  // (Phase 4 global scope, legacy bare-id row, etc.) is handled correctly.
  // The previous direct `cm.getConfig('component-registry')` only matched
  // the bare-id row and missed registries written under non-default scopes.
  let singletonKeys = new Set<string>();
  try {
    const registry = await loadRegistryConfig({ appId, userId });
    singletonKeys = singletonKeysFromRegistryEntries(registry?.entries as RegistryEntryLite[] | undefined);
  } catch (err) {
    // Failing to load the registry should not cause us to delete singleton
    // rows. Other rules (explicit flag, singleton-shape) still protect them.
    console.warn('[workspace-gc] failed to load registry; falling back to flag/shape rules only:', err);
  }

  const result: GcResult = {
    scanned: 0,
    deleted: 0,
    wouldDelete: 0,
    preservedTemplate: 0,
    preservedKnown: 0,
    preservedSingleton: 0,
    preservedSingletonShape: 0,
    preservedReferenced: 0,
  };

  for (const row of inScope) {
    // Workspace rows are not per-instance — never GC them here
    if (row.componentType === COMPONENT_TYPES.WORKSPACE) continue;

    result.scanned++;

    if (row.isTemplate) {
      result.preservedTemplate++;
      if (verbose) console.debug(`[workspace-gc] keep (template): ${row.configId}`);
      continue;
    }
    if (WELL_KNOWN_SHARED_CONFIG_IDS.has(row.configId)) {
      result.preservedKnown++;
      if (verbose) console.debug(`[workspace-gc] keep (well-known): ${row.configId}`);
      continue;
    }
    if (singletonKeys.has(row.configId)) {
      result.preservedSingleton++;
      if (verbose) console.debug(`[workspace-gc] keep (singleton-registry): ${row.configId}`);
      continue;
    }
    // Rule 4 — self-describing fallback. Protects singleton rows by
    // recognising that their configId matches the canonical derivation.
    // Catches both legacy rows that pre-date isTemplate stamping and
    // any row whose template flag has drifted.
    if (isSingletonShape(row)) {
      result.preservedSingletonShape++;
      if (verbose) console.debug(`[workspace-gc] keep (singleton-shape): ${row.configId}`);
      continue;
    }
    if (referenced.has(row.configId)) {
      result.preservedReferenced++;
      if (verbose) console.debug(`[workspace-gc] keep (referenced): ${row.configId}`);
      continue;
    }

    // No preservation rule matched. Tally what *would* have been
    // deleted, but only actually delete when DELETION_ENABLED is on.
    result.wouldDelete++;
    if (!DELETION_ENABLED) {
      if (verbose) console.debug(`[workspace-gc] would-delete (disabled): ${row.configId}`);
      continue;
    }
    try {
      await cm.deleteConfig(row.configId);
      result.deleted++;
      if (verbose) console.debug(`[workspace-gc] DELETE: ${row.configId}`);
    } catch (err) {
      console.warn(`[workspace-gc] failed to delete configId='${row.configId}':`, err);
    }
  }

  return result;
}
