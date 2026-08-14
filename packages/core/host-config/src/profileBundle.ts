/**
 * Bundled profile-set persistence — one module, three public surfaces.
 *
 * A MarketsGrid instance stores every one of its profiles (plus
 * `gridLevelData`) in a SINGLE `AppConfigRow` keyed by `instanceId`,
 * with `payload = { version, profiles[], gridLevelData }`. This file
 * owns the read-modify-write of that bundle and exposes it ONE way:
 * `createConfigServiceStorage` → the `StorageAdapter` behind the
 * `<MarketsGrid storage=…>` prop. (The `ConfigManager.profiles`
 * namespace and `createConfigPort` surfaces were deleted in the
 * persistence consolidation — every writer now goes through the
 * adapter, which routes row change events via
 * `ConfigManager.onRowChanged`.)
 */

// Type-only import — @wellsfargo-starui/core is a peerDependency so the types
// line up exactly with what MarketsGrid expects. No runtime dep on
// core; consumers naturally satisfy the peer by depending on both.
import type { ProfileSnapshot, StorageAdapter } from '@wellsfargo-starui/core';

import type { ConfigManager } from './ConfigManager.js';
import type { AppConfigRow } from './types';
import {
  MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE,
  ProfileSetVersionConflictError,
  type ProfileSetPayload,
  type ProfileSetSaveOptions,
  type ProfileSetScope,
  type RegisteredComponentIdentity,
} from './profileBundle.types';

// Re-export the names that external consumers import from this module's
// public barrel (`index.ts`), so the package's export surface is stable.
export {
  MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE,
  MARKETS_GRID_PROFILE_COMPONENT_TYPE,
  ProfileSetVersionConflictError,
} from './profileBundle.types';
export type {
  ProfileSetPayload,
  ProfileSetScope,
  ProfileSetSaveOptions,
  RegisteredComponentIdentity,
  ProfileSnapshot,
  StorageAdapter,
};

// ─── ConfigManager surfaces these helpers depend on ──────────────────

/** Minimal ConfigManager surface used by bundled profile-set I/O. */
export interface ProfileSetConfigAccess {
  getConfig(configId: string): Promise<AppConfigRow | null | undefined>;
  saveConfig(row: AppConfigRow): Promise<void>;
}

// ─── Read-modify-write helpers ───────────────────────────────────────

/**
 * A pre-fetched row, boxed so `{ row: undefined }` ("provided, no row on
 * disk") is distinguishable from passing no argument ("fetch it yourself").
 * Lets a caller that already holds the row — e.g. the config-service
 * adapter's per-scope cache — skip a redundant `getConfig`. The shared
 * version / normalize logic stays in one place either way.
 */
export interface PrefetchedRow {
  row: AppConfigRow | undefined;
}

/**
 * Read the bundled row for `scope`. Returns `null` when no row exists
 * yet (consumer treats null as "first launch, start empty"). Filters
 * defensively: a row that happens to share `configId` but belongs to a
 * different `(appId, userId)` is treated as missing rather than
 * misappropriated.
 *
 * `prefetched`, when supplied, is used in place of a `getConfig` call —
 * the caller vouches it's the current row for `scope`.
 */
export async function loadProfileSet(
  configManager: ProfileSetConfigAccess,
  scope: ProfileSetScope,
  prefetched?: PrefetchedRow,
): Promise<ProfileSetPayload | null> {
  const row = prefetched ? prefetched.row : await configManager.getConfig(scope.instanceId);
  if (isProfileSetRow(row, scope.appId, scope.userId)) {
    return normalizePayload(row.payload);
  }
  return null;
}

function hasProfileSetShape(row: AppConfigRow): boolean {
  const payload = row.payload as { profiles?: unknown } | null | undefined;
  return row.componentType === MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE
    || Array.isArray(payload?.profiles);
}

/**
 * Storage-adapter read: returns profile-set bytes when the row has bundle
 * shape, even if `appId`/`userId` drifted (export/seed class), so
 * gridLevelData / profile RMW does not wipe with `profiles: []`.
 */
export function readProfileSetPayload(
  row: AppConfigRow | null | undefined,
  scope: Pick<ProfileSetScope, 'appId' | 'userId'>,
): ProfileSetPayload | null {
  void scope;
  if (!row || !hasProfileSetShape(row)) return null;
  return normalizePayload(row.payload);
}

/**
 * Write the bundle with optimistic-concurrency check.
 */
export async function saveProfileSet(
  configManager: ProfileSetConfigAccess,
  scope: ProfileSetScope,
  set: ProfileSetPayload,
  expectedVersion: number,
  options: ProfileSetSaveOptions = {},
  prefetched?: PrefetchedRow,
): Promise<void> {
  const { instanceId, appId, userId } = scope;
  const now = new Date().toISOString();
  const existing = prefetched ? prefetched.row : await configManager.getConfig(instanceId);
  // Version lives on the payload regardless of scope drift — a row at this
  // configId with mismatched appId must still participate in OCC so
  // concurrent gridLevelData + profile writes do not silently clobber.
  const actualVersion = existing ? readVersion(existing.payload) : 0;

  if (actualVersion !== expectedVersion) {
    throw new ProfileSetVersionConflictError(expectedVersion, actualVersion, instanceId);
  }

  const creationTime = isProfileSetRow(existing, appId, userId)
    ? (existing?.creationTime ?? now)
    : now;

  const identity = options.identity;
  const componentType = identity?.componentType ?? MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE;
  const componentSubType = identity?.componentSubType ?? '';
  const isTemplate = identity?.isTemplate === true;
  const singleton = identity?.singleton === true;
  const displayTextPrefix = options.displayTextPrefix ?? 'MarketsGrid profiles';

  const row: AppConfigRow = {
    configId: instanceId,
    appId,
    userId,
    isPublic: existing?.isPublic ?? true,
    displayText: `${displayTextPrefix}: ${instanceId}`,
    componentType,
    componentSubType,
    isTemplate,
    singleton,
    payload: { ...set, version: expectedVersion + 1 },
    createdBy: existing?.createdBy ?? userId,
    updatedBy: userId,
    creationTime,
    updatedTime: now,
  };
  await configManager.saveConfig(row);
}

export function isProfileSetRow(
  row: AppConfigRow | null | undefined,
  appId: string,
  userId: string,
): row is AppConfigRow {
  if (!row) return false;
  if (row.appId !== appId || row.userId !== userId) return false;
  const payload = row.payload as { profiles?: unknown } | null | undefined;
  return Array.isArray(payload?.profiles)
    || row.componentType === MARKETS_GRID_PROFILE_SET_COMPONENT_TYPE;
}

export function normalizePayload(payload: unknown): ProfileSetPayload {
  const p = payload as
    | { profiles?: unknown; version?: unknown; gridLevelData?: unknown }
    | null
    | undefined;
  const arr = Array.isArray(p?.profiles) ? p.profiles : [];
  const profiles: ProfileSnapshot[] = [];
  for (const raw of arr) {
    const snap = normalizeSnapshot(raw);
    if (snap) profiles.push(snap);
  }
  return { version: readVersion(p), profiles, gridLevelData: p?.gridLevelData };
}

export function readVersion(payload: unknown): number {
  const v = (payload as { version?: unknown } | null | undefined)?.version;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function normalizeSnapshot(raw: unknown): ProfileSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<ProfileSnapshot> & { gridId?: string };
  if (!p.id || !p.gridId) return null;
  return {
    id: String(p.id),
    gridId: String(p.gridId),
    name: String(p.name ?? ''),
    state: (p.state ?? {}) as ProfileSnapshot['state'],
    createdAt: Number(p.createdAt ?? Date.now()),
    updatedAt: Number(p.updatedAt ?? Date.now()),
  };
}

// ─── Surface 2: `createConfigServiceStorage` (StorageAdapter) ─────────

export interface ConfigManagerForProfileStorage extends ProfileSetConfigAccess {
  /** Per-row change subscription (same-tab + cross-tab). */
  onRowChanged(configId: string, fn: () => void): () => void;
}

export interface ConfigServiceStorageOptions {
  /** Already-initialized ConfigManager instance. Bring-your-own so
   *  consumer controls Dexie vs REST mode + init lifecycle. */
  configManager: ConfigManagerForProfileStorage;
  /** Optional app-id fallback — used when MarketsGrid doesn't pass
   *  `appId` at call time. Most apps leave this undefined and pass
   *  `appId` on the `<MarketsGrid>` prop instead (reactive identity). */
  appId?: string;
  /** Optional user-id fallback — same treatment as `appId`. */
  userId?: string;
  /** Optional display-text used on the stored row. Defaults to
   *  "MarketsGrid profiles: <instanceId>". Only surfaces in the
   *  Config Browser UI. */
  displayTextPrefix?: string;
}

/**
 * Identity of the registered component this MarketsGrid instance is
 * persisting state for — propagated onto the saved AppConfigRow so
 * its `componentType` / `componentSubType` / `isTemplate` /
 * `singleton` fields reflect the registered entry, not a hardcoded
 * "markets-grid-profile-set" placeholder.
 *
 * When omitted (e.g. legacy callers or unit tests that don't model a
 * registered component), the row falls back to the legacy
 * `componentType: 'markets-grid-profile-set'`, `componentSubType: ''`,
 * `isTemplate: false` defaults.
 */
export interface ProfileStorageFactoryOpts {
  instanceId: string;
  appId?: string;
  userId?: string;
  /**
   * Identity of the registered component. When provided, the saver
   * writes `componentType`, `componentSubType`, `isTemplate`, and
   * `singleton` from this object onto every persisted row — ENFORCED
   * on every write, so a stale row from before identity-aware saves
   * gets corrected on the next save.
   */
  registeredIdentity?: RegisteredComponentIdentity;
}

/** Factory type — matches `StorageAdapterFactory` in @wellsfargo-starui/markets-grid. */
export type ProfileStorageFactory = (opts: ProfileStorageFactoryOpts) => StorageAdapter;

/**
 * Create a profile-storage factory backed by ConfigService.
 *
 * The factory takes `{ instanceId, appId?, userId? }` at call time.
 * MarketsGrid supplies those from its own props.
 *
 * Resolution order for `appId` / `userId`:
 *   1. Call-time opts (from MarketsGrid's appId/userId props)
 *   2. Closure fallback (from `createConfigServiceStorage({ appId, userId })`)
 *   3. Error — thrown on the first CRUD call if neither is available
 *
 * Typical usage:
 *
 *   const storage = createConfigServiceStorage({ configManager });
 *   <MarketsGrid storage={storage} appId="TestApp" userId={userId} />
 *
 * User-switching becomes trivial — change the userId prop; no factory
 * re-creation needed. If you still want app-bootstrap-level scoping,
 * pass `appId`/`userId` to `createConfigServiceStorage({...})` as
 * closure fallbacks; MarketsGrid's props override them.
 */
export function createConfigServiceStorage(
  opts: ConfigServiceStorageOptions,
): ProfileStorageFactory {
  const { configManager } = opts;
  const closureAppId = opts.appId;
  const closureUserId = opts.userId;
  const displayTextPrefix = opts.displayTextPrefix ?? 'MarketsGrid profiles';

  return (factoryOpts: ProfileStorageFactoryOpts): StorageAdapter => {
    const instanceId = factoryOpts.instanceId;
    const appId = factoryOpts.appId ?? closureAppId;
    const userId = factoryOpts.userId ?? closureUserId;
    const identity = factoryOpts.registeredIdentity;

    if (!appId || !userId) {
      throw new Error(
        'createConfigServiceStorage: appId and userId must be supplied ' +
        'either at factory-creation time (createConfigServiceStorage({ appId, userId })) ' +
        'or at call time via MarketsGrid props. ' +
        `Received: appId=${JSON.stringify(appId)}, userId=${JSON.stringify(userId)}.`,
      );
    }

    const scope = { instanceId, appId, userId };
    const saveOptions = { identity, displayTextPrefix };

    // Per-scope cache of the raw AppConfigRow. `ConfigManager.getConfig`
    // now memoizes single-row reads itself, so this layer's cache is a
    // thin local optimization that also short-circuits the version-check
    // read inside `saveProfileSet`. Holding the row collapses the reads
    // this adapter controls into one. The shared version / normalize /
    // metadata logic still lives in `loadProfileSet` / `saveProfileSet` —
    // we just feed them the cached row instead of re-fetching.
    //
    // Invalidation: cleared after every local write AND on any change
    // notification for this row (cross-tab writes, or any other writer
    // going through ConfigManager), so the cache never serves a row
    // that's gone stale past a write.
    let cachedRow: AppConfigRow | undefined;
    let cacheLoaded = false;
    const invalidate = (): void => {
      cacheLoaded = false;
      cachedRow = undefined;
    };
    const readRow = async (): Promise<AppConfigRow | undefined> => {
      if (!cacheLoaded) {
        cachedRow = (await configManager.getConfig(scope.instanceId)) ?? undefined;
        cacheLoaded = true;
      }
      return cachedRow;
    };

    // OCC read-modify-write with bounded retry. A single bundled row can be
    // targeted by TWO adapter instances at once — MarketsGridContainer's
    // adapter writes `gridLevelData` (provider selection) while MarketsGrid's
    // controller adapter writes profiles — each holding an INDEPENDENT version
    // cache, and the gridLevelData adapter does not subscribe to change
    // notifications. When the other instance bumps the row version between our
    // cached read and our write, `saveProfileSet` throws
    // `ProfileSetVersionConflictError`. Dropping the write here is what
    // silently lost the provider selection (the grid booted empty next launch).
    // Instead: invalidate, re-read the current row, rebuild the payload from
    // it (preserving the other writer's changes), and retry.
    //
    // `build` returns the next payload, or `null` to signal a no-op (e.g.
    // deleting a profile that isn't there) so we skip the write entirely.
    const MAX_COMMIT_ATTEMPTS = 5;
    const commit = async (
      build: (loaded: ProfileSetPayload | null) => ProfileSetPayload | null,
    ): Promise<void> => {
      for (let attempt = 1; ; attempt++) {
        const loaded = readProfileSetPayload(await readRow(), scope);
        const next = build(loaded);
        if (next === null) return;
        const expectedVersion = loaded?.version ?? 0;
        try {
          // Deliberately DON'T hand saveProfileSet our cached row as the
          // prefetched OCC source — a second adapter instance over this row
          // (e.g. MarketsGridContainer's gridLevelData adapter vs the grid's
          // profile adapter) may have bumped the version since we cached it,
          // and trusting the stale row would mask the conflict and clobber
          // the other writer. saveProfileSet reads the authoritative row for
          // the version check (ConfigManager memoizes that read).
          await saveProfileSet(configManager, scope, next, expectedVersion, saveOptions);
          invalidate();
          return;
        } catch (err) {
          // Drop the stale cache so the retry re-reads the row the
          // conflicting writer just committed, rebuilds on top of it, and
          // re-writes — instead of silently dropping this write.
          invalidate();
          if (err instanceof ProfileSetVersionConflictError && attempt < MAX_COMMIT_ATTEMPTS) {
            continue;
          }
          throw err;
        }
      }
    };

    const adapter: StorageAdapter = {
      async loadProfile(gridId: string, profileId: string): Promise<ProfileSnapshot | null> {
        void gridId; // gridId maps 1:1 to instanceId at this seam
        const set = readProfileSetPayload(await readRow(), scope);
        if (!set) return null;
        return set.profiles.find((p) => p.id === profileId) ?? null;
      },

      async saveProfile(snapshot: ProfileSnapshot): Promise<void> {
        // Load the existing bundle, then upsert the snapshot and write back.
        // `commit` threads the expected-version into saveProfileSet (OCC) and
        // retries on conflict so a concurrent gridLevelData / cross-tab write
        // doesn't drop this one. `gridLevelData` is preserved verbatim —
        // saving a profile must not clobber it.
        await commit((loaded) => {
          const profiles = loaded?.profiles ? [...loaded.profiles] : [];
          const idx = profiles.findIndex((p) => p.id === snapshot.id);
          if (idx >= 0) {
            profiles[idx] = snapshot;
          } else {
            profiles.push(snapshot);
          }
          return { version: loaded?.version ?? 0, profiles, gridLevelData: loaded?.gridLevelData };
        });
      },

      async deleteProfile(gridId: string, profileId: string): Promise<void> {
        void gridId;
        await commit((loaded) => {
          if (!loaded) return null;
          const filtered = loaded.profiles.filter((p) => p.id !== profileId);
          if (filtered.length === loaded.profiles.length) return null; // not found; no-op
          return { version: loaded.version, profiles: filtered, gridLevelData: loaded.gridLevelData };
        });
      },

      async listProfiles(gridId: string): Promise<ProfileSnapshot[]> {
        void gridId;
        const set = readProfileSetPayload(await readRow(), scope);
        return set?.profiles ?? [];
      },

      async loadGridLevelData(gridId: string): Promise<unknown | null> {
        void gridId;
        const set = readProfileSetPayload(await readRow(), scope);
        return set?.gridLevelData ?? null;
      },

      async saveGridLevelData(gridId: string, data: unknown): Promise<void> {
        void gridId;
        // Read-modify-write the same bundled row. Keep profiles intact — only
        // the `gridLevelData` field changes. `commit` retries on an OCC
        // conflict (e.g. the controller's profile save bumped the version
        // after this adapter cached it) so the provider selection is never
        // silently dropped.
        await commit((loaded) => ({
          version: loaded?.version ?? 0,
          profiles: loaded?.profiles ?? [],
          gridLevelData: data,
        }));
      },

      // Multi-tab subscribe (Session 3.2 / consolidation). When the
      // ConfigManager publishes a `configChanged` notification for
      // this `instanceId` — including a write that originated in
      // another tab via BroadcastChannel — fire the listener so
      // ProfileManager (or any other consumer) can refresh.
      //
      subscribeToChanges(gridId: string, fn: () => void): () => void {
        void gridId;
        // Drop the cached row before notifying the consumer so its
        // refetch (and any read this adapter does next) sees the new
        // row, not the stale cached one. Covers cross-tab writes and
        // any writer that goes through ConfigManager rather than this
        // adapter instance.
        return configManager.onRowChanged(scope.instanceId, () => {
          invalidate();
          fn();
        });
      },
    };

    // Brand the adapter with its scope so `migrateProfilesToConfigService`
    // and other tooling can recover the `(instanceId, appId, userId)`
    // identity without re-reading the closure. Non-enumerable to keep
    // the runtime shape clean for consumers that introspect via
    // `Object.keys(adapter)`.
    Object.defineProperty(adapter, CONFIG_SERVICE_ADAPTER_BRAND, {
      value: { configManager, scope },
      enumerable: false,
      writable: false,
      configurable: false,
    });

    return adapter;
  };
}

/**
 * Symbol brand placed on the StorageAdapter returned from
 * `createConfigServiceStorage`. Lets internal code (e.g. the migration
 * trigger) recover the manager + scope without re-deriving them. Use
 * `getConfigServiceAdapterBrand(adapter)` to read.
 */
export const CONFIG_SERVICE_ADAPTER_BRAND = Symbol.for(
  '@wellsfargo-starui/core/host/config/profile-storage-adapter',
);

/** Recover the `{ configManager, scope }` brand from a StorageAdapter
 *  returned by `createConfigServiceStorage`. Returns `undefined` for
 *  any other adapter implementation. */
export function getConfigServiceAdapterBrand(
  adapter: StorageAdapter,
): { configManager: ConfigManagerForProfileStorage; scope: { instanceId: string; appId: string; userId: string } } | undefined {
  const branded = adapter as unknown as Record<symbol, unknown>;
  const brand = branded[CONFIG_SERVICE_ADAPTER_BRAND];
  if (
    brand
    && typeof brand === 'object'
    && 'configManager' in brand
    && 'scope' in brand
  ) {
    return brand as { configManager: ConfigManagerForProfileStorage; scope: { instanceId: string; appId: string; userId: string } };
  }
  return undefined;
}

/**
 * One-shot migration helper: copy profiles from local Dexie/Memory
 * storage into ConfigService bundled storage for a given `(gridId,
 * instanceId, userId)` tuple.
 *
 * Consumer-triggered — NOT called automatically. Trading apps that
 * want to migrate users write a small admin action that invokes this
 * once per known instance.
 *
 * Strategy:
 *   "skip-if-exists" (default) — no-op when target already has any
 *   profiles in the bundle (cross-device safety: user may have newer
 *   data on another device already synced).
 *
 *   "overwrite" — unconditionally rewrites the target bundle with
 *   the source profile list.
 *
 * Returns `{ migrated: boolean, count?: number, reason?: string }`.
 */
export async function migrateProfilesToConfigService(params: {
  source: StorageAdapter;
  target: ProfileStorageFactory;
  gridId: string;
  instanceId?: string;
  /** App + user identity passed into the factory at call time. If the
   *  factory was built with closure-level fallbacks these may be
   *  omitted — otherwise they're required, same rule as MarketsGrid. */
  appId?: string;
  userId?: string;
  strategy?: 'skip-if-exists' | 'overwrite';
}): Promise<{ migrated: boolean; count?: number; reason?: string }> {
  const effectiveInstanceId = params.instanceId ?? params.gridId;
  const targetAdapter = params.target({
    instanceId: effectiveInstanceId,
    appId: params.appId,
    userId: params.userId,
  });
  const strategy = params.strategy ?? 'skip-if-exists';

  const existing = await targetAdapter.listProfiles(effectiveInstanceId);
  if (existing.length > 0 && strategy === 'skip-if-exists') {
    return { migrated: false, reason: 'target-has-profiles' };
  }

  const sourceProfiles = await params.source.listProfiles(params.gridId);
  if (sourceProfiles.length === 0) {
    return { migrated: false, reason: 'no-source-profiles' };
  }

  // Rewrite gridId to the target's instanceId so snapshots round-trip
  // cleanly through the bundled adapter. saveProfile is sequential
  // but load-modify-writes the same bundle each time — acceptable for
  // a one-shot migration at small sizes.
  for (const profile of sourceProfiles) {
    await targetAdapter.saveProfile({ ...profile, gridId: effectiveInstanceId });
  }

  return { migrated: true, count: sourceProfiles.length };
}

