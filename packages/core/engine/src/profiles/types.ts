import type { SerializedState } from '../platform/types';

/** Condensed profile record used in UI lists. */
export interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  isDefault: boolean;
}

/**
 * Portable JSON payload produced by `ProfileManager.export()` and accepted
 * by `.import()`. Shape-locked by `schemaVersion` — bump on breaking
 * changes + keep the old version loadable for one release.
 *
 * `schemaVersion`:
 *   - `1` — profile body only (legacy; still imports).
 *   - `2` — adds the optional `gridLevelData` sibling so a single export
 *     is a complete grid-view snapshot (provider selection, caption,
 *     event bindings) rather than profile state alone. The grid-level
 *     blob lives OUTSIDE `profile` because it is grid-scoped, not
 *     profile-scoped — see `docs/PROFILE_PERSISTENCE.md`.
 */
export interface ExportedProfilePayload {
  schemaVersion: 1 | 2;
  kind: 'gc-profile';
  exportedAt: string;
  profile: {
    name: string;
    gridId: string;
    state: Record<string, SerializedState>;
  };
  /**
   * Opaque grid-level data bundled alongside the profile (schemaVersion 2+).
   * Persisted by the storage adapter's `saveGridLevelData`; shape is owned
   * by the consumer (`<MarketsGridContainer>` uses `GridLevelStateV1`).
   * Absent on v1 exports and on grids whose adapter has no grid-level data.
   */
  gridLevelData?: unknown;
}
