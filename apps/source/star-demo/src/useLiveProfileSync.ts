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

  useEffect(() => {
    // Every guard here is load-bearing: this is a convenience layer, and a host
    // whose ConfigManager doesn't expose the profiles namespace (or a test
    // double that stubs part of it) must render the grid normally, not crash.
    if (!configManager || !instanceId) return;
    if (typeof configManager.profiles?.subscribe !== 'function') return;

    let disposed = false;
    const handleChange = async () => {
      if (disposed) return;
      const target = getTargetRef.current();
      if (!target || !target.activeProfileId) {
        onSkippedRef.current?.('no-grid');
        return;
      }
      if (target.isDirty) {
        // The user's in-flight edits outrank a remote change.
        onSkippedRef.current?.('dirty');
        return;
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
      if (updatedAt <= appliedAtRef.current) {
        onSkippedRef.current?.('not-newer');
        return;
      }

      appliedAtRef.current = updatedAt;
      await target.loadProfile(target.activeProfileId);
      onAppliedRef.current?.(target.activeProfileId);
    };

    const unsubscribe = configManager.profiles.subscribe({ instanceId }, () => {
      void handleChange();
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [configManager, instanceId]);
}
