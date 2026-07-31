import type { AppConfigRow } from './types';

/**
 * Thrown when an update is rejected because the row was modified by
 * another writer between the caller's read and the caller's write
 * (Decision 12.5 / Session 6). In REST mode this surfaces a server-side
 * HTTP 412 response; in local mode the manager performs the same check
 * against Dexie before persisting.
 *
 * The `currentRow` field carries the latest row state when known so the
 * editor UI can offer a "row changed elsewhere — reload?" prompt and
 * either restart the edit or discard the local change.
 */
export class OptimisticLockError extends Error {
  constructor(public readonly currentRow: AppConfigRow | undefined) {
    super('Row changed since edit began');
    this.name = 'OptimisticLockError';
  }
}

/**
 * Thrown by {@link ConfigManager.updateConfig} when the target row does
 * not exist. Update is a read-modify-write; there is nothing to patch.
 */
export class ConfigNotFoundError extends Error {
  constructor(public readonly configId: string) {
    super(`Configuration not found: ${configId}`);
    this.name = 'ConfigNotFoundError';
  }
}
