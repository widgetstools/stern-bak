/**
 * Internal constants + structural contracts for {@link ConfigManager}.
 * Extracted so the orchestrator module reads as behaviour rather than a
 * wall of magic strings and tuning knobs. No runtime logic lives here.
 */
import type { AppIdentity } from './types';

/**
 * Minimal structural view of the Web Locks `LockManager` used for the
 * cold-start seed lock. Declared locally so the package does not depend on the
 * DOM lib's `LockManager` type being present in every consuming tsconfig.
 */
export interface SeedLockManager {
  request(
    name: string,
    options: { mode: 'exclusive' | 'shared' },
    callback: () => Promise<void>,
  ): Promise<void>;
}

/**
 * Fixed name of the framework-owned AppData provider (Decision 4 in
 * `config-manager-redesign.md`). Every ConfigManager that's wired
 * with `dataServices` writes its identity / profile keys into this
 * single named row; consumers read it via `appData.get(...)`.
 */
export const APPLICATION_CONTEXT_NAME = 'ApplicationContext';

// Dev placeholders used when the host app doesn't pass `appId` /
// `identity`. Keep these aligned with the JSDoc on the option fields
// so first-run docs and runtime defaults can never drift.
export const DEFAULT_APP_ID = 'dev-app';
export const DEFAULT_IDENTITY: AppIdentity = {
  userId: 'dev-user',
  displayName: 'Dev User',
};

/** Rows shared across every user of the app keep `userId: 'system'`. */
export const GLOBAL_OWNER_USER_ID = 'system';
export const COMPONENT_TYPE_REGISTRY = 'component-registry';
export const COMPONENT_TYPE_DATA_PROVIDER = 'data-provider';
export const COMPONENT_TYPE_APPDATA = 'appdata';

// How often to retry failed REST writes.
// 10 seconds is a balance: short enough to recover quickly after a
// network blip, long enough not to flood the server with retries.
export const PENDING_SYNC_INTERVAL_MS = 10_000;

// How many times to retry a failed REST write before giving up.
// After MAX_SYNC_RETRIES, the row stays in PENDING_SYNC for manual
// investigation — it is never automatically deleted on failure.
export const MAX_SYNC_RETRIES = 10;
