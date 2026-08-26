/**
 * Profile create / update / delete / switch for a blotter.
 *
 * A profile is a `ProfileSnapshot` in the grid's profile-set row, and
 * `configManager.profiles.save()` upserts by `snapshot.id` — so "create" is a
 * save with a fresh id and "update" is a save with the existing one.
 *
 * ## Why switching is different
 *
 * Which profile is ACTIVE is not part of the row. The OpenFin host reads and
 * writes `activeProfileId` on the view's `customData`
 * (`packages/core/engine/src/profiles/ProfileManager.ts`), so no amount of
 * config writing makes a grid switch. `switch_profile` therefore records the
 * request in gridLevelData and lets the open window act on it — see
 * `src/useLiveProfileSync.ts`, which already subscribes to this row.
 */
import type { ConfigManager, ProfileSnapshot } from '@wellsfargo-starui/core/host/config';
import {
  readActiveProfile,
  resolveWriteTargets,
  resolveGridEntry,
  patchGridLevelData,
  describeFanOut,
  DEFAULT_PROFILE_ID,
} from './gridProfiles';
import type { ToolExecutionResult } from './toolResult';

/** Profile ids the platform owns; renaming or deleting one strands the grid. */
const RESERVED_PROFILE_IDS = new Set([DEFAULT_PROFILE_ID]);

function slugifyProfileId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `ai-${slug || 'profile'}-${Date.now().toString(36)}`;
}

export async function listProfiles(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const snapshots = await configManager.profiles.list({ instanceId: entry.configId });
  const profiles = snapshots.map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.id === DEFAULT_PROFILE_ID,
    moduleCount: Object.keys(p.state ?? {}).length,
    updatedAt: p.updatedAt,
  }));
  return {
    ok: true,
    summary: profiles.length
      ? `${profiles.length} profile(s) on "${entry.displayName}": ${profiles.map((p) => `${p.name} (${p.id})`).join(', ')}.`
      : `"${entry.displayName}" has no saved profiles yet.`,
    data: profiles,
  };
}

/**
 * Creates a profile. By default it captures the grid's CURRENT configuration —
 * "save what I have now as Trading view" is what people mean — with
 * `fromCurrent: false` for a blank one.
 */
export async function createProfile(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  const name = args.name as string | undefined;
  if (!targetGridId || !name) return { ok: false, summary: 'Missing required field(s): targetGridId, name.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const existing = await configManager.profiles.list({ instanceId: entry.configId });
  if (existing.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, summary: `"${entry.displayName}" already has a profile called "${name}". Pick another name or update that one.` };
  }

  const fromCurrent = args.fromCurrent !== false;
  const source = fromCurrent ? await readActiveProfile(configManager, entry.configId) : null;
  const id = slugifyProfileId(name);
  const now = Date.now();

  // Fan out: a profile written only to the template row would not exist in a
  // window that is already open.
  const targets = await resolveWriteTargets(configManager, entry);
  for (const target of targets) {
    const snapshot: ProfileSnapshot = {
      id,
      gridId: target.instanceId,
      name,
      state: source ? structuredClone(source.state) : {},
      createdAt: now,
      updatedAt: now,
    };
    await configManager.profiles.save({ instanceId: target.instanceId }, snapshot);
  }

  const instances = targets.filter((t) => !t.isTemplate).length;
  return {
    ok: true,
    summary:
      `Created profile "${name}" (id=${id}) on "${entry.displayName}"` +
      (instances > 0 ? ` and ${instances} open instance(s)` : '') +
      (fromCurrent ? ', capturing the current configuration.' : ', empty.'),
    data: { id, name },
  };
}

/** Renames a profile and/or overwrites its state from the current config. */
export async function updateProfile(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  const profileId = args.profileId as string | undefined;
  if (!targetGridId || !profileId) return { ok: false, summary: 'Missing required field(s): targetGridId, profileId.' };
  const name = args.name as string | undefined;
  const captureCurrent = args.captureCurrent === true;
  if (!name && !captureCurrent) {
    return { ok: false, summary: 'Nothing to change — pass name, captureCurrent: true, or both.' };
  }
  if (name && RESERVED_PROFILE_IDS.has(profileId)) {
    return { ok: false, summary: `"${profileId}" is the platform's default profile and can't be renamed.` };
  }

  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const current = captureCurrent ? await readActiveProfile(configManager, entry.configId) : null;
  const targets = await resolveWriteTargets(configManager, entry);
  let found = false;
  for (const target of targets) {
    const snapshots = await configManager.profiles.list({ instanceId: target.instanceId });
    const existing = snapshots.find((p) => p.id === profileId);
    if (!existing) continue;
    found = true;
    await configManager.profiles.save(
      { instanceId: target.instanceId },
      {
        ...existing,
        name: name ?? existing.name,
        state: current ? structuredClone(current.state) : existing.state,
        updatedAt: Date.now(),
      },
    );
  }

  if (!found) {
    return { ok: false, summary: `No profile with id "${profileId}" on "${entry.displayName}". Call list_profiles to see ids.` };
  }
  const parts = [name ? `renamed to "${name}"` : null, captureCurrent ? 'captured the current configuration' : null].filter(Boolean);
  return { ok: true, summary: `Profile ${profileId} on "${entry.displayName}": ${parts.join(' and ')}.` };
}

export async function deleteProfile(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  const profileId = args.profileId as string | undefined;
  if (!targetGridId || !profileId) return { ok: false, summary: 'Missing required field(s): targetGridId, profileId.' };
  if (RESERVED_PROFILE_IDS.has(profileId)) {
    return { ok: false, summary: `"${profileId}" is the platform's default profile — deleting it would leave the grid with nothing to load.` };
  }
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const snapshots = await configManager.profiles.list({ instanceId: entry.configId });
  const existing = snapshots.find((p) => p.id === profileId);
  if (!existing) {
    return { ok: false, summary: `No profile with id "${profileId}" on "${entry.displayName}". Call list_profiles to see ids.` };
  }
  if (args.confirm !== true) {
    return {
      ok: false,
      summary: `Deleting profile "${existing.name}" (${profileId}) is permanent. Ask the user to confirm, then call again with confirm: true.`,
    };
  }

  const targets = await resolveWriteTargets(configManager, entry);
  for (const target of targets) {
    await configManager.profiles.delete({ instanceId: target.instanceId }, profileId);
  }
  return { ok: true, summary: `Deleted profile "${existing.name}" (${profileId}) from "${entry.displayName}".` };
}

/**
 * Asks open windows to switch. Config alone can't do this (see the header
 * note), so the request goes into gridLevelData and `useLiveProfileSync` picks
 * it up — which means it moves windows that are open NOW.
 */
export async function switchProfile(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  const profileId = args.profileId as string | undefined;
  if (!targetGridId || !profileId) return { ok: false, summary: 'Missing required field(s): targetGridId, profileId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const snapshots = await configManager.profiles.list({ instanceId: entry.configId });
  const target = snapshots.find((p) => p.id === profileId);
  if (!target) {
    return { ok: false, summary: `No profile with id "${profileId}" on "${entry.displayName}". Call list_profiles to see ids.` };
  }

  const fan = await patchGridLevelData(configManager, entry, (prev) => ({
    ...prev,
    requestedActiveProfileId: profileId,
    requestedActiveProfileAt: Date.now(),
  }));

  return {
    ok: true,
    summary:
      `Asked "${entry.displayName}"${describeFanOut(fan)} to switch to profile "${target.name}". ` +
      'Open windows switch now; a window opened later starts on whichever profile it last had.',
  };
}
