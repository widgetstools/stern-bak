/**
 * Persisted profile shape. `state` is the map of module id → versioned
 * envelope that `GridPlatform.serializeAll()` produces. Adapters treat it as
 * an opaque blob — only the platform knows how to interpret it.
 *
 * ONE declaration, in `@wellsfargo-starui/types` — the same interface the
 * host layer's `StoragePort` uses, which is what lets an adapter cross the
 * engine/host seam without `as unknown as`.
 */
export type { ProfileSnapshot } from '@wellsfargo-starui/types';
import type { ProfileSnapshot } from '@wellsfargo-starui/types';

/**
 * Minimal K/V contract for per-grid profile storage.
 *
 * Implementations:
 *  - `MemoryAdapter` — in-memory, used for tests + hosts that don't want
 *    persistence.
 *  - `LocalStorageBundleAdapter` — localStorage-backed bundle, used by
 *    the offline reference app.
 *  - `createConfigServiceStorage(...)` from `@wellsfargo-starui/config-service` —
 *    the canonical IndexedDB-backed factory; bundles every profile for
 *    a `(appId, userId, instanceId)` tuple into one `appConfig` row.
 */
export interface StorageAdapter {
  loadProfile(gridId: string, profileId: string): Promise<ProfileSnapshot | null>;
  saveProfile(snapshot: ProfileSnapshot): Promise<void>;
  deleteProfile(gridId: string, profileId: string): Promise<void>;
  /** Unordered list of all profiles for a grid. The ProfileManager sorts. */
  listProfiles(gridId: string): Promise<ProfileSnapshot[]>;

  /**
   * Read the grid-level data blob — opaque payload persisted alongside
   * profiles in the same backing row. Used for state that should survive
   * profile switches (e.g. the v2 data-provider selection: live + historical
   * provider ids and the live/historical mode).
   *
   * Returns `null` when no value has been persisted yet, or when the
   * adapter doesn't implement grid-level data (older adapters from
   * before this method was added).
   *
   * Optional so existing third-party StorageAdapter implementations
   * keep compiling. MarketsGrid checks for the method at runtime and
   * silently no-ops grid-level-data reads/writes when missing.
   */
  loadGridLevelData?(gridId: string): Promise<unknown | null>;

  /**
   * Persist the grid-level data blob. The shape is opaque to the
   * adapter — callers (typically `<MarketsGridContainer>`) own the
   * type. The adapter just stores and returns it.
   *
   * Should round-trip through `loadGridLevelData` byte-equivalently
   * (JSON serialization is acceptable). Called whenever the consumer
   * mutates `gridLevelData` via the `<MarketsGrid>` prop.
   */
  saveGridLevelData?(gridId: string, data: unknown): Promise<void>;

  /**
   * Subscribe to external changes affecting `gridId`'s persisted state.
   * Fires whenever any writer (this tab, another tab, REST sync) updates
   * the underlying row. Returns an unsubscribe function.
   *
   * `ProfileManager.boot()` wires this when present so cross-tab edits
   * become visible without a manual reload — the `profile-state-
   * consolidation` audit (Risk #6, "Two-tab race") closes here.
   *
   * Optional: adapters that don't have a notification channel
   * (Memory, LocalStorageBundle) omit it and `ProfileManager` silently
   * skips the wiring.
   */
  subscribeToChanges?(gridId: string, fn: () => void): () => void;
}

/** Sentinel id for the auto-managed Default profile. Reserved — `createProfile`
 *  rejects this id; `deleteProfile` on this id is a no-op. */
export const RESERVED_DEFAULT_PROFILE_ID = '__default__';

/** localStorage key holding the active profile id for a grid. */
export const activeProfileKey = (gridId: string): string =>
  `gc-active-profile:${gridId}`;

/**
 * Options passed into a `StorageAdapterFactory` at call time.
 */
export interface StorageAdapterFactoryOpts {
  instanceId: string;
  appId?: string;
  userId?: string;
  gridId?: string;
}

export type StorageAdapterFactory = (opts: StorageAdapterFactoryOpts) => StorageAdapter;
