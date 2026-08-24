/**
 * Profile reads and writes for a registered blotter — and the template /
 * instance distinction that decides whether a change is actually visible.
 *
 * ## Why writing the template alone isn't enough
 *
 * A registry entry's `configId` addresses the component's TEMPLATE row
 * (`isTemplate: true`). Launching a blotter from the dock does NOT read that
 * row: `launch.ts` mints a per-window instance id and eagerly CLONES the
 * template into a fresh `isTemplate: false` row, after which "the view then
 * reads its own row directly — no lazy seed-from-template". The one exception
 * is a singleton component, whose instance id equals the template id.
 *
 * So a write to the template alone reaches:
 *   - singleton blotters (same row), and
 *   - windows opened AFTER the write (they clone the updated template),
 * but never a non-singleton blotter that is already open or was opened before.
 * That is exactly the "it only changed the template, not my grid" symptom.
 *
 * Every mutation therefore fans out across the template AND each live instance
 * row descended from it. The update callback runs against each row's OWN
 * previous state, so an instance keeps whatever the user customised there and
 * still receives the change.
 */
import type { ConfigManager, ProfileSnapshot } from '@wellsfargo-starui/core/host/config';
import { loadRegistryConfig, type RegistryEntry } from '@wellsfargo-starui/openfin/config';

/** Registered MarketsGrid blotters all share this componentType. */
export const BLOTTER_COMPONENT_TYPE = 'grid';

/** Looks a blotter up by its Component Registry id. */
export async function resolveGridEntry(targetGridId: string): Promise<RegistryEntry | undefined> {
  const registry = await loadRegistryConfig();
  return registry?.entries.find((e) => e.id === targetGridId && e.componentType === BLOTTER_COMPONENT_TYPE);
}

/**
 * The platform's reserved id for a grid's default profile. Seeding anything
 * else (e.g. 'default') makes `ProfileManager.boot()` create a SECOND empty
 * "Default" beside ours, and the user's customizations land on the invisible one.
 */
export const DEFAULT_PROFILE_ID = '__default__';

export interface WriteTarget {
  instanceId: string;
  isTemplate: boolean;
  /** Human-facing label used in tool summaries. */
  label: string;
}

/** Loads a grid's default profile, or an empty one to patch when none exists yet. */
export async function readDefaultProfile(
  configManager: ConfigManager,
  instanceId: string,
): Promise<ProfileSnapshot> {
  const snapshots = await configManager.profiles.list({ instanceId });
  const existing = snapshots.find((s) => s.id === DEFAULT_PROFILE_ID) ?? snapshots[0];
  if (existing) return existing;
  const now = Date.now();
  return { id: DEFAULT_PROFILE_ID, gridId: instanceId, name: 'Default', state: {}, createdAt: now, updatedAt: now };
}

function identityFor(entry: RegistryEntry, isTemplate: boolean) {
  return {
    componentType: entry.componentType,
    componentSubType: entry.componentSubType,
    isTemplate,
    // Only the template row carries the entry's singleton flag; cloned
    // instance rows are minted with `singleton: false` (see launch.ts).
    singleton: isTemplate ? entry.singleton : false,
  };
}

/**
 * Instance rows cloned from this entry's template, newest first. A singleton
 * reuses the template id, so it never appears here — its single row IS the
 * template and is covered by the template target.
 */
export async function listInstanceRows(
  configManager: ConfigManager,
  entry: RegistryEntry,
): Promise<Array<{ configId: string; displayText?: string; updatedTime?: string }>> {
  const rows = await configManager.findByComponentType(entry.componentType, entry.componentSubType);
  return rows
    .filter((row) => row.isTemplate !== true && row.configId !== entry.configId)
    .map((row) => ({
      configId: row.configId,
      displayText: row.displayText,
      updatedTime: row.updatedTime,
    }))
    // Newest first — `updatedTime` is an ISO timestamp, so lexical order is
    // chronological order.
    .sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));
}

/** Template row plus every live instance descended from it. */
export async function resolveWriteTargets(
  configManager: ConfigManager,
  entry: RegistryEntry,
): Promise<WriteTarget[]> {
  const targets: WriteTarget[] = [
    { instanceId: entry.configId, isTemplate: true, label: `${entry.displayName} (template)` },
  ];
  // Never let a failure to enumerate instances block the template write —
  // the template is the one target that must always succeed.
  let instances: Array<{ configId: string }> = [];
  try {
    instances = await listInstanceRows(configManager, entry);
  } catch (err) {
    console.warn('[aiAssistant] could not enumerate instance rows — template only:', err);
  }
  for (const row of instances) {
    targets.push({ instanceId: row.configId, isTemplate: false, label: row.configId });
  }
  return targets;
}

export function patchModuleState(snapshot: ProfileSnapshot, moduleId: string, data: unknown): ProfileSnapshot {
  const prevVersion = snapshot.state[moduleId]?.v ?? 1;
  return {
    ...snapshot,
    state: { ...snapshot.state, [moduleId]: { v: prevVersion, data } },
    updatedAt: Date.now(),
  };
}

export interface FanOutResult {
  /** How many open/persisted instances also received the change. */
  instances: number;
}

/**
 * Read → patch one module's state → write back, across the template and every
 * instance. `update` is invoked once per target with that target's own state.
 */
export async function patchGridModule(
  configManager: ConfigManager,
  entry: RegistryEntry,
  moduleId: string,
  update: (prevData: unknown) => unknown,
): Promise<FanOutResult> {
  const targets = await resolveWriteTargets(configManager, entry);
  let instances = 0;
  for (const target of targets) {
    const profile = await readDefaultProfile(configManager, target.instanceId);
    const next = patchModuleState(profile, moduleId, update(profile.state[moduleId]?.data));
    await configManager.profiles.save({ instanceId: target.instanceId }, next, {
      identity: identityFor(entry, target.isTemplate),
    });
    if (!target.isTemplate) instances += 1;
  }
  return { instances };
}

/** Same fan-out for grid-level data (provider bindings, captions). */
export async function patchGridLevelData(
  configManager: ConfigManager,
  entry: RegistryEntry,
  update: (prev: Record<string, unknown>) => Record<string, unknown>,
): Promise<FanOutResult> {
  const targets = await resolveWriteTargets(configManager, entry);
  let instances = 0;
  for (const target of targets) {
    const prev = ((await configManager.profiles.loadGridLevelData({ instanceId: target.instanceId })) ??
      {}) as Record<string, unknown>;
    await configManager.profiles.saveGridLevelData({ instanceId: target.instanceId }, update(prev), {
      identity: identityFor(entry, target.isTemplate),
    });
    if (!target.isTemplate) instances += 1;
  }
  return { instances };
}

/** " (and 2 open instance(s))" — appended to tool summaries so the fan-out is visible. */
export function describeFanOut(result: FanOutResult): string {
  return result.instances > 0 ? ` and ${result.instances} open instance(s)` : '';
}
