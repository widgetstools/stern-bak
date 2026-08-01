/**
 * Profile-state consolidation — first-boot migration (Session 3.2).
 *
 * Copies any rows still sitting in the legacy `gc-customizer-v2` Dexie
 * database (the previous `DexieAdapter` store, removed in Session 3.3)
 * into the ConfigService bundled row via the existing
 * `migrateProfilesToConfigService` helper.
 *
 * Triggered ONCE per device from `<ConfigServiceProvider>` after
 * `ConfigManager.init()` resolves. Idempotent via a
 * `profile-migration-v1` flag stored in `localStorage` — re-runs after
 * the flag is set are no-ops.
 *
 * The legacy DB is **not** deleted afterwards. Two reasons:
 *   1. If the user rolls back to a previous build, their profiles are
 *      still there.
 *   2. A separate post-3.3 cleanup PR can drop the legacy schema after
 *      a soak period.
 *
 * See `docs/PROFILE-STATE-CONSOLIDATION.md` "Migration plan" for the
 * full reasoning.
 */

import type { ProfileSnapshot } from '@wellsfargo-starui/engine';

import type { ConfigManager } from '../ConfigManager';

/** Default localStorage key. Exposed for tests. */
export const PROFILE_MIGRATION_V1_FLAG = 'profile-migration-v1';

/** Default legacy Dexie database name. Exposed for tests. */
export const LEGACY_PROFILES_DB_NAME = 'gc-customizer-v2';

/** Default legacy Dexie table name (one row per profile). */
export const LEGACY_PROFILES_TABLE = 'profiles';

/** Persisted shape inside `gc-customizer-v2.profiles`. The `pk`
 *  primary key is `${gridId}::${id}` — used to distinguish the
 *  rows but we don't need it after migration. */
interface LegacyProfileRow {
  pk: string;
  id: string;
  gridId: string;
  name: string;
  state: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** Outcome reported back to the Provider — useful for tests + the
 *  one-line `console.info` the Provider logs on success. */
export interface MigrationResult {
  /** True when the migration ran (or was skipped because the flag was
   *  already set). False only when the helper threw. */
  ok: boolean;
  /** True the very first time the migration runs end-to-end. False on
   *  every subsequent boot (flag-already-set short-circuit). */
  ranThisBoot: boolean;
  /** True when the legacy DB existed AND held rows. */
  legacyDbHadRows: boolean;
  /** Number of legacy rows successfully copied across all `gridId`s
   *  encountered. Zero when the legacy DB was missing / empty / the
   *  target already had data (skip-if-exists). */
  copied: number;
  /** Reason returned by `migrateProfilesToConfigService` per gridId.
   *  Stored as `Record<gridId, reason>` for diagnostics. */
  perGrid: Record<string, { migrated: boolean; count?: number; reason?: string }>;
}

/** Optional knobs — only tests pass these. The Provider always calls
 *  with no overrides, accepting the defaults. */
export interface MigrationOptions {
  /** Override the localStorage flag key. Tests use a unique name to
   *  isolate runs. */
  flagKey?: string;
  /** Override the legacy DB name. Tests use a unique name to isolate
   *  runs. */
  legacyDbName?: string;
  /** Storage interface — tests inject a stub. Defaults to
   *  `globalThis.localStorage`. Returns `null` when unavailable; the
   *  migration treats no-flag as "haven't run yet". */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/**
 * Run the migration once. Safe to call on every Provider mount — the
 * flag short-circuits subsequent runs in O(1).
 *
 * Errors are logged + swallowed; the function NEVER throws so a
 * failure in a one-off migration can't break ConfigManager bootstrap.
 * If a bug shows up we ship a follow-up under a different flag name.
 */
export async function migrateLegacyProfilesIfNeeded(
  manager: ConfigManager,
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  const flagKey = options.flagKey ?? PROFILE_MIGRATION_V1_FLAG;
  const legacyDbName = options.legacyDbName ?? LEGACY_PROFILES_DB_NAME;
  const storage = options.storage === undefined
    ? typeof localStorage === 'undefined'
      ? null
      : localStorage
    : options.storage;

  const result: MigrationResult = {
    ok: true,
    ranThisBoot: false,
    legacyDbHadRows: false,
    copied: 0,
    perGrid: {},
  };

  // Flag already set — no work, no logs.
  if (storage?.getItem(flagKey) === 'done') {
    return result;
  }

  // No IndexedDB in this environment — nothing to migrate. Set the flag
  // so we don't re-check on every cold boot.
  if (typeof indexedDB === 'undefined') {
    storage?.setItem(flagKey, 'done');
    return result;
  }

  result.ranThisBoot = true;

  try {
    const legacyRows = await readLegacyProfiles(legacyDbName);

    if (legacyRows.length === 0) {
      storage?.setItem(flagKey, 'done');
      return result;
    }

    result.legacyDbHadRows = true;

    // Group by gridId so each (gridId) maps to one bundled row in the
    // target. Legacy paths used `gridId === instanceId`, so we pass
    // the same value for both to `migrateProfilesToConfigService`.
    const byGridId = new Map<string, LegacyProfileRow[]>();
    for (const row of legacyRows) {
      const list = byGridId.get(row.gridId);
      if (list) list.push(row);
      else byGridId.set(row.gridId, [row]);
    }

    for (const [gridId, rows] of byGridId) {
      try {
        // skip-if-exists: don't overwrite ConfigService data the user
        // may have generated on another device that's already synced.
        const existing = await manager.profiles.list({ instanceId: gridId });
        if (existing.length > 0) {
          result.perGrid[gridId] = { migrated: false, reason: 'target-has-profiles' };
          continue;
        }

        // Sequential — read-modify-writes the same bundled row each
        // time. Acceptable for a one-shot migration at small sizes.
        // Rewrite gridId → instanceId; legacy paths use them
        // interchangeably so this is a no-op on the data but keeps the
        // snapshot's `gridId` field consistent with where it lives.
        for (const row of rows) {
          const snapshot: ProfileSnapshot = {
            id: row.id,
            gridId,
            name: row.name,
            state: row.state as ProfileSnapshot['state'],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
          await manager.profiles.save({ instanceId: gridId }, snapshot);
        }

        result.perGrid[gridId] = { migrated: true, count: rows.length };
        result.copied += rows.length;
      } catch (err) {
        // Per-gridId failure must not block siblings.
        // eslint-disable-next-line no-console
        console.warn(`[profile-migration-v1] gridId="${gridId}" failed:`, err);
        result.perGrid[gridId] = { migrated: false, reason: 'error' };
      }
    }
  } catch (err) {
    // Top-level failure (Dexie open error, etc.). The flag still flips
    // so we don't fight the same error on every cold boot. A follow-up
    // PR under a different flag name can re-run if needed.
    // eslint-disable-next-line no-console
    console.warn('[profile-migration-v1] failed:', err);
    result.ok = false;
  } finally {
    // Set the flag in `finally` so a partial / failed migration still
    // flips the flag — we do NOT retry forever and lose user time on
    // every cold boot. Per design doc "Idempotency" section.
    storage?.setItem(flagKey, 'done');
  }

  return result;
}

/**
 * Open the legacy `gc-customizer-v2` Dexie database read-only and pull
 * every row from its `profiles` table. Returns `[]` when the DB doesn't
 * exist — opening a non-existent DB silently creates it via Dexie, so
 * we use the raw IndexedDB API and bail when `onupgradeneeded` fires
 * (proof that the DB was just created).
 */
async function readLegacyProfiles(dbName: string): Promise<LegacyProfileRow[]> {
  return new Promise<LegacyProfileRow[]>((resolve) => {
    const req = indexedDB.open(dbName);
    let createdJustNow = false;

    req.onupgradeneeded = () => {
      // The DB doesn't exist on this device. Cancel the upgrade by
      // aborting the transaction, then resolve with an empty list once
      // the open completes.
      createdJustNow = true;
      try {
        req.transaction?.abort();
      } catch {
        /* ignore */
      }
    };

    req.onerror = () => {
      // Open failed (private mode, quota, etc.). Treat as "no legacy
      // data". The flag still flips so we don't keep retrying.
      resolve([]);
    };

    req.onsuccess = () => {
      const db = req.result;
      if (createdJustNow || !db.objectStoreNames.contains(LEGACY_PROFILES_TABLE)) {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        // Delete the just-created empty DB so we don't pollute the
        // user's IndexedDB with our probe.
        if (createdJustNow) {
          try {
            indexedDB.deleteDatabase(dbName);
          } catch {
            /* ignore */
          }
        }
        resolve([]);
        return;
      }

      let tx: IDBTransaction;
      try {
        tx = db.transaction(LEGACY_PROFILES_TABLE, 'readonly');
      } catch {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        resolve([]);
        return;
      }
      const store = tx.objectStore(LEGACY_PROFILES_TABLE);
      const allReq = store.getAll();
      allReq.onerror = () => {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        resolve([]);
      };
      allReq.onsuccess = () => {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        const raw = (allReq.result ?? []) as unknown[];
        resolve(raw.filter(isLegacyRow));
      };
    };
  });
}

function isLegacyRow(row: unknown): row is LegacyProfileRow {
  if (!row || typeof row !== 'object') return false;
  const r = row as Partial<LegacyProfileRow>;
  return typeof r.id === 'string'
    && typeof r.gridId === 'string'
    && typeof r.name === 'string'
    && typeof r.createdAt === 'number'
    && typeof r.updatedAt === 'number';
}

