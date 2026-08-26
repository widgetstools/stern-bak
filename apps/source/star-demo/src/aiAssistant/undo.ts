/**
 * Undo for assistant changes.
 *
 * Every mutation applies immediately, which is right for a conversational tool
 * — but only if it's reversible. Before the first mutating call of a turn, the
 * affected grids' profiles are snapshotted across every write target (template
 * + open instances); undoing writes them back.
 *
 * Deliberately in memory, NOT as a `__ai-undo__` profile row: profiles appear
 * in the user's profile picker, and a machine-generated entry there is worse
 * than no undo at all.
 *
 * ## What is and isn't covered
 *
 * Profile-level state — styling, layout, rules, module settings, module items,
 * profiles themselves — restores exactly. Registry/dock changes (create or
 * delete a blotter) and data-provider changes live in different stores with no
 * snapshot, so a turn containing those reports honestly that they stayed put
 * rather than pretending the whole turn reversed.
 */
import type { ConfigManager, ProfileSnapshot } from '@wellsfargo-starui/core/host/config';
import { resolveGridEntry, resolveWriteTargets } from './gridProfiles';

/** Tools whose effects a profile snapshot cannot restore. */
export const IRREVERSIBLE_TOOLS = new Set([
  'create_blotter',
  'delete_blotter',
  'rename_blotter',
  'create_data_provider',
  'update_data_provider',
  'delete_data_provider',
  'open_blotter',
]);

/** Tools that change nothing, so a turn made only of these needs no snapshot. */
export function isMutatingTool(name: string): boolean {
  return !name.startsWith('list_') && !name.startsWith('get_') && !name.startsWith('describe_') && name !== 'diagnose_grid';
}

export interface ProfileBackup {
  instanceId: string;
  /** Every profile in the row, so a created/deleted profile also reverses. */
  snapshots: ProfileSnapshot[];
}

export interface UndoEntry {
  /** What the user asked for, for the summary line. */
  label: string;
  backups: ProfileBackup[];
  /** Tools in this turn whose effects cannot be reversed. */
  irreversible: string[];
  at: number;
}

/** Captures every profile of every write target for one grid. */
export async function captureGrid(
  configManager: ConfigManager,
  targetGridId: string,
): Promise<ProfileBackup[]> {
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return [];
  const targets = await resolveWriteTargets(configManager, entry);
  const backups: ProfileBackup[] = [];
  for (const target of targets) {
    const snapshots = await configManager.profiles.list({ instanceId: target.instanceId });
    backups.push({ instanceId: target.instanceId, snapshots: structuredClone([...snapshots]) });
  }
  return backups;
}

/**
 * Writes a captured state back. Profiles that exist now but not in the backup
 * are deleted, so "create a profile" reverses as well as "edit one".
 */
export async function restore(configManager: ConfigManager, backups: ProfileBackup[]): Promise<void> {
  for (const backup of backups) {
    const current = await configManager.profiles.list({ instanceId: backup.instanceId });
    const backedUpIds = new Set(backup.snapshots.map((s) => s.id));
    for (const snapshot of backup.snapshots) {
      await configManager.profiles.save({ instanceId: backup.instanceId }, snapshot);
    }
    for (const existing of current) {
      if (!backedUpIds.has(existing.id)) {
        await configManager.profiles.delete({ instanceId: backup.instanceId }, existing.id);
      }
    }
  }
}

/** Bounded so a long session doesn't hold every profile it ever touched. */
const MAX_ENTRIES = 10;

export function pushEntry(stack: UndoEntry[], entry: UndoEntry): UndoEntry[] {
  return [...stack, entry].slice(-MAX_ENTRIES);
}

export function describeUndo(entry: UndoEntry): string {
  const grids = entry.backups.length;
  const note = entry.irreversible.length
    ? ` ${entry.irreversible.length} change(s) in that turn can't be undone automatically (${[...new Set(entry.irreversible)].join(', ')}) — they stayed as they are.`
    : '';
  return `Reverted "${entry.label}" across ${grids} config row(s).${note}`;
}
