/**
 * Re-applies a blotter's saved profile when something outside this window
 * changes it — so an edit made by the AI Assistant (or Workspace Setup, or a
 * second window) shows up without the user reloading the component.
 *
 * How the signal arrives: `ConfigManager` publishes every row write to a
 * `BroadcastChannel`, and `configManager.profiles.subscribe({ instanceId })`
 * fires for that row in same-tab AND cross-tab writers. Nothing subscribed to
 * it before, which is why an open grid never noticed external edits.
 *
 * Two guards keep this from being destructive:
 *
 *  1. **Never clobber unsaved work.** The grid saves its own profile too, and
 *     the notifier can't tell us who wrote. If the user has unsaved changes
 *     (`isDirty`), we skip the re-apply rather than discard them.
 *  2. **Ignore our own writes.** A re-apply triggered by this window's own
 *     save is at best a pointless remount and at worst a flicker mid-edit, so
 *     we compare the row's `updatedAt` against the last one we applied and
 *     skip anything not newer.
 */
import { useEffect, useRef } from 'react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

export interface LiveProfileSyncTarget {
  /** Active profile id, and the imperative reload. Shape of `MarketsGridHandle.profiles`. */
  activeProfileId?: string;
  isDirty?: boolean;
  loadProfile: (id: string) => void | Promise<void>;
  /**
   * Scoped re-hydrate of just the given module id(s), leaving every other
   * module's live state untouched — see `ProfileManager.syncModules`.
   * Optional so a target that doesn't implement it (or an older consumer of
   * this hook) safely falls back to `loadProfile`.
   */
  syncModules?: (moduleIds: readonly string[]) => void | Promise<void>;
}

/**
 * Records which profile a window is showing, into that window's own config row.
 *
 * The active profile id is otherwise unreachable from another window: the
 * localStorage fallback is keyed by `gridId`, which every blotter of this route
 * shares, and the authoritative per-view value lives on OpenFin `customData`.
 * Publishing it here is what lets the assistant edit the profile the user is
 * actually looking at instead of always writing `__default__`.
 */
export async function publishActiveProfile(
  configManager: ConfigManager | undefined,
  instanceId: string | undefined,
  profileId: string,
): Promise<void> {
  if (!configManager || !instanceId || typeof configManager.profiles?.saveGridLevelData !== 'function') return;
  try {
    const prev = ((await configManager.profiles.loadGridLevelData({ instanceId })) ?? {}) as Record<string, unknown>;
    if (prev.activeProfileId === profileId) return;
    await configManager.profiles.saveGridLevelData({ instanceId }, { ...prev, activeProfileId: profileId });
  } catch (err) {
    console.debug('[liveProfileSync] could not publish the active profile id:', err);
  }
}

export interface UseLiveProfileSyncOptions {
  configManager: ConfigManager | undefined;
  /** The grid's own config row id — NOT the registry entry's template id. */
  instanceId: string | undefined;
  /** Returns the live grid handle's `profiles`, or undefined before onReady. */
  getTarget: () => LiveProfileSyncTarget | undefined;
  /** Test seam. */
  onApplied?: (profileId: string) => void;
  onSkipped?: (reason: 'dirty' | 'not-newer' | 'no-grid') => void;
}

export function useLiveProfileSync({
  configManager,
  instanceId,
  getTarget,
  onApplied,
  onSkipped,
}: UseLiveProfileSyncOptions): void {
  // Refs so re-renders don't tear down the subscription.
  const getTargetRef = useRef(getTarget);
  getTargetRef.current = getTarget;
  const appliedAtRef = useRef(0);
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;
  const onSkippedRef = useRef(onSkipped);
  onSkippedRef.current = onSkipped;
  // Which module(s) a not-yet-applied notification told us changed, and
  // whether any notification arrived WITHOUT that hint (meaning "assume
  // everything may have changed"). Populated synchronously on every notify,
  // before this hook's own `await`s — so if two notifications for two
  // different modules race (two overlapping async handleChange calls), the
  // invocation that actually ends up applying the change drains and applies
  // BOTH modules, not just whichever call happened to "win" the staleness
  // check below. See handleChange's use of these.
  const pendingModuleIdsRef = useRef<Set<string>>(new Set());
  const pendingFullReloadRef = useRef(false);

  useEffect(() => {
    // Every guard here is load-bearing: this is a convenience layer, and a host
    // whose ConfigManager doesn't expose the profiles namespace (or a test
    // double that stubs part of it) must render the grid normally, not crash.
    if (!configManager || !instanceId) return;
    if (typeof configManager.profiles?.subscribe !== 'function') return;

    let disposed = false;
    const handleChange = async (changedModuleIds?: string[]) => {
      if (disposed) return;
      if (changedModuleIds && changedModuleIds.length > 0) {
        for (const id of changedModuleIds) pendingModuleIdsRef.current.add(id);
      } else {
        pendingFullReloadRef.current = true;
      }

      const target = getTargetRef.current();
      if (!target || !target.activeProfileId) {
        onSkippedRef.current?.('no-grid');
        return;
      }
      if (target.isDirty) {
        // Deliberately NOT a skip.
        //
        // An external change is something the user just asked for — via the
        // assistant, Workspace Setup, or another window. Declining to apply it
        // because this grid has unsaved state means they're told "done" and see
        // nothing change, which is the worst of both worlds. A blotter is dirty
        // most of the time it's been touched at all, so a skip here is not the
        // rare safety net it looks like.
        //
        // The cost is real and worth naming: unsaved local edits to the same
        // modules are overwritten. Made loud rather than silent.
        console.warn(
          '[liveProfileSync] applying an external config change over unsaved local changes — ' +
            'the grid had edits that were not saved to its profile.',
        );
      }

      // A profile SWITCH can't be expressed as a config write — `activeProfileId`
      // lives on the view, not the row — so `switch_profile` records the request
      // here and this is where it gets honoured.
      let requestedProfileId: string | undefined;
      let requestedAt = 0;
      try {
        const gridLevelData = (await configManager.profiles.loadGridLevelData({ instanceId })) as
          | { requestedActiveProfileId?: string; requestedActiveProfileAt?: number }
          | null;
        if (typeof gridLevelData?.requestedActiveProfileId === 'string') {
          requestedProfileId = gridLevelData.requestedActiveProfileId;
          requestedAt = gridLevelData.requestedActiveProfileAt ?? 0;
        }
      } catch {
        /* no grid-level data — nothing requested */
      }

      let updatedAt = 0;
      try {
        const snapshots = await configManager.profiles.list({ instanceId });
        updatedAt = snapshots.reduce((max, s) => Math.max(max, s.updatedAt ?? 0), 0);
      } catch {
        // Can't tell how fresh it is — fall through and re-apply rather than
        // leave the grid showing stale config.
        updatedAt = Date.now();
      }

      const freshest = Math.max(updatedAt, requestedAt);
      if (freshest <= appliedAtRef.current) {
        onSkippedRef.current?.('not-newer');
        return;
      }

      // A newer switch request wins over a plain re-apply of the active one.
      const profileId =
        requestedProfileId && requestedAt > appliedAtRef.current ? requestedProfileId : target.activeProfileId;
      appliedAtRef.current = freshest;

      // Drain whatever's accumulated so far — including hints from any
      // sibling notification that lost the staleness race above — and reset
      // for the next round.
      const moduleIds = [...pendingModuleIdsRef.current];
      const syncModules = target.syncModules;
      const needsFullReload =
        pendingFullReloadRef.current ||
        !syncModules ||
        moduleIds.length === 0 ||
        // A genuine profile switch touches every module by definition — a
        // scoped sync of the OLD profile's changed modules would be wrong.
        profileId !== target.activeProfileId;
      pendingModuleIdsRef.current.clear();
      pendingFullReloadRef.current = false;

      if (needsFullReload || !syncModules) {
        await target.loadProfile(profileId);
      } else {
        await syncModules(moduleIds);
      }
      onAppliedRef.current?.(profileId);
    };

    const unsubscribe = configManager.profiles.subscribe({ instanceId }, (changedModuleIds) => {
      void handleChange(changedModuleIds);
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [configManager, instanceId]);
}
