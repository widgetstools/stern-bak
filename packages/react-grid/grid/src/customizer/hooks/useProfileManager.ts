import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  ProfileManager,
  type ActiveIdSource,
  type ExportedProfilePayload,
  type GridPlatform,
  type ProfileManagerOptions,
  type ProfileManagerState,
  type ProfileMeta,
  type StorageAdapter,
} from '@wellsfargo-starui/core';
import { useGridPlatform } from './GridProvider';

const NOOP_UNSUBSCRIBE = () => {};

export interface UseProfileManagerResult {
  activeProfileId: string;
  profiles: ProfileMeta[];
  isLoading: boolean;
  /** True when the live store has diverged from the last successful
   *  persist of the active profile. Drives the dirty-dot indicator on
   *  the Save button + triggers the unsaved-changes confirm flow on
   *  profile switch and page unload. */
  isDirty: boolean;
  loadProfile: (id: string) => Promise<void>;
  /** Re-sync the profile list from storage. Needed after any write that
   *  bypassed this manager's own list-mutating methods (e.g. a bulk
   *  `setConfig` import) — `loadProfile` alone won't pick up rows added
   *  that way. See `ProfileManager.refresh` for why. */
  refreshProfiles: () => Promise<void>;
  saveActiveProfile: () => Promise<void>;
  /** Throw away in-memory changes and reload the active profile from
   *  disk. Used by the Discard branch of the unsaved-changes prompt. */
  discardActiveProfile: () => Promise<void>;
  createProfile: (name: string, opts?: { id?: string }) => Promise<ProfileMeta>;
  /** Duplicate an existing profile into a new one under `name`.
   *  Activates the clone immediately. If `sourceId` is the active
   *  profile, captures the live (possibly-dirty) state so the clone
   *  reflects what the user currently sees. */
  cloneProfile: (sourceId: string, name: string, opts?: { id?: string }) => Promise<ProfileMeta>;
  deleteProfile: (id: string) => Promise<void>;
  renameProfile: (id: string, name: string) => Promise<void>;
  exportProfile: (id?: string) => Promise<ExportedProfilePayload>;
  importProfile: (
    payload: unknown,
    options?: { name?: string; activate?: boolean },
  ) => Promise<ProfileMeta>;
}

/**
 * Per-platform singleton map — one `ProfileManager` lives for the platform
 * instance's lifetime. React 19 StrictMode fires a synthetic unmount+remount
 * on the initial mount; naïve `managerRef.current = null` + `dispose()` in
 * the useEffect cleanup would build a fresh manager on every simulated
 * remount, leaving zombie auto-save subscriptions on the shared store and
 * orphaning the listener binding React holds.
 *
 * Keying off the platform (which already survives StrictMode via
 * useGridHost's fix) ensures a single manager per grid, initialised lazily
 * on first hook call and disposed when the platform is destroyed — not
 * when React decides to run a second mount pass.
 */
const MANAGERS_BY_PLATFORM = new WeakMap<GridPlatform, ProfileManager>();

function getOrCreateManager(opts: ProfileManagerOptions): ProfileManager {
  const existing = MANAGERS_BY_PLATFORM.get(opts.platform);
  if (existing) return existing;
  const manager = new ProfileManager(opts);
  MANAGERS_BY_PLATFORM.set(opts.platform, manager);
  // Dispose when the platform tears down — the real teardown, not the
  // StrictMode simulated one.
  opts.platform.events.on('grid:destroyed', () => {
    manager.dispose();
    MANAGERS_BY_PLATFORM.delete(opts.platform);
  });
  // Boot once. Subsequent hook callers return the same (already-booted)
  // manager.
  void manager.boot();
  return manager;
}

/**
 * Thin React binding over `ProfileManager`. The class is the source of
 * truth; this hook exposes a React-shaped state via `useSyncExternalStore`
 * (prevents tearing under concurrent rendering) + a stable callbacks
 * surface. Angular ships its own binding.
 */
export function useProfileManager(opts: {
  adapter: StorageAdapter;
  autoSaveDebounceMs?: number;
  disableAutoSave?: boolean;
  /** Optional higher-priority active-id pointer (e.g. OpenFin view
   *  customData). See `ActiveIdSource` in `@wellsfargo-starui/core`. */
  activeIdSource?: ActiveIdSource;
}): UseProfileManagerResult {
  const platform = useGridPlatform();

  // Keep the FIRST options seen — the manager is a per-platform singleton;
  // passing different options on re-renders can't rebuild the manager
  // without a grid remount, so we snapshot the initial values.
  const optsRef = useRef(opts);
  const manager = getOrCreateManager({
    platform,
    adapter: optsRef.current.adapter,
    autoSaveDebounceMs: optsRef.current.autoSaveDebounceMs,
    disableAutoSave: optsRef.current.disableAutoSave,
    activeIdSource: optsRef.current.activeIdSource,
  });

  // Subscribe via useSyncExternalStore for tear-free concurrent reads. The
  // subscribe fn adds a listener to the manager; React uses getSnapshot to
  // read the current state. No useEffect cleanup race: when the component
  // unmounts for real, React removes the subscription cleanly.
  const subscribe = useCallback(
    (onChange: () => void) => manager.subscribe(() => onChange()),
    [manager],
  );
  const getSnapshot = useCallback(
    (): ProfileManagerState => manager.getState(),
    [manager],
  );
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const loadProfile = useCallback((id: string) => manager.load(id), [manager]);
  const refreshProfiles = useCallback(() => manager.refresh(), [manager]);
  const saveActiveProfile = useCallback(() => manager.save(), [manager]);
  const discardActiveProfile = useCallback(() => manager.discard(), [manager]);
  const createProfile = useCallback(
    (name: string, o?: { id?: string }) => manager.create(name, o),
    [manager],
  );
  const cloneProfile = useCallback(
    (sourceId: string, name: string, o?: { id?: string }) => manager.clone(sourceId, name, o),
    [manager],
  );
  const deleteProfile = useCallback((id: string) => manager.remove(id), [manager]);
  const renameProfile = useCallback(
    (id: string, name: string) => manager.rename(id, name),
    [manager],
  );
  const exportProfile = useCallback((id?: string) => manager.export(id), [manager]);
  const importProfile = useCallback(
    (payload: unknown, o?: { name?: string; activate?: boolean }) => manager.import(payload, o),
    [manager],
  );

  return useMemo(
    () => ({
      activeProfileId: state.activeId,
      profiles: state.profiles,
      isLoading: state.isLoading,
      isDirty: state.isDirty,
      loadProfile,
      refreshProfiles,
      saveActiveProfile,
      discardActiveProfile,
      createProfile,
      cloneProfile,
      deleteProfile,
      renameProfile,
      exportProfile,
      importProfile,
    }),
    [
      state.activeId,
      state.profiles,
      state.isLoading,
      state.isDirty,
      loadProfile,
      refreshProfiles,
      saveActiveProfile,
      discardActiveProfile,
      createProfile,
      cloneProfile,
      deleteProfile,
      renameProfile,
      exportProfile,
      importProfile,
    ],
  );
}

/**
 * Field-selector hooks: subscribe to ONE slice of profile-manager state via
 * its own `useSyncExternalStore`. Consumers that only need (say) `isDirty`
 * skip the re-render churn caused by reading the full state bundle when
 * sibling fields (`profiles`, `activeId`) change.
 *
 * Requires `useProfileManager(opts)` to have been called on the same
 * platform somewhere up the tree — typically by `MarketsGridHost`. If no
 * manager has been initialised yet the selector returns the default-state
 * value rather than throwing, so child components that briefly mount before
 * the host's first commit don't tear.
 */
function useManagerSelector<T>(select: (state: ProfileManagerState) => T, fallback: T): T {
  const platform = useGridPlatform();
  const manager = MANAGERS_BY_PLATFORM.get(platform) ?? null;
  const subscribe = useCallback(
    (onChange: () => void) =>
      manager ? manager.subscribe(() => onChange()) : NOOP_UNSUBSCRIBE,
    [manager],
  );
  const getSnapshot = useCallback(
    () => (manager ? select(manager.getState()) : fallback),
    [manager, select, fallback],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function selectActiveId(s: ProfileManagerState): string {
  return s.activeId;
}
function selectProfiles(s: ProfileManagerState): ProfileMeta[] {
  return s.profiles;
}
function selectIsDirty(s: ProfileManagerState): boolean {
  return s.isDirty;
}
function selectIsLoading(s: ProfileManagerState): boolean {
  return s.isLoading;
}

const EMPTY_PROFILES: ProfileMeta[] = [];

function useActiveId(): string {
  return useManagerSelector(selectActiveId, '');
}
function useProfiles(): ProfileMeta[] {
  return useManagerSelector(selectProfiles, EMPTY_PROFILES);
}
function useIsDirty(): boolean {
  return useManagerSelector(selectIsDirty, false);
}
function useIsLoading(): boolean {
  return useManagerSelector(selectIsLoading, true);
}

// Attach as static-style sub-hooks so consumers can write
// `useProfileManager.useIsDirty()` etc. — narrow subscription without
// disturbing existing `useProfileManager(opts)` callers.
useProfileManager.useActiveId = useActiveId;
useProfileManager.useProfiles = useProfiles;
useProfileManager.useIsDirty = useIsDirty;
useProfileManager.useIsLoading = useIsLoading;
