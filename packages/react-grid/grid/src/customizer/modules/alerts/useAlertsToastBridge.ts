/**
 * Subscribes to the alerts module state and pushes each fresh notification
 * through `@wellsfargo-starui/react`'s `toast()` when its rule asked for the `'toast'`
 * channel and `settings.enabledChannels.toast` is on.
 *
 * The bridge diffs `state.history` against a per-mount `seenIds` set so a
 * remount (e.g. profile switch) doesn't replay older notifications. New
 * notifications always sit at index 0 of the history array (dispatcher
 * prepends), so we walk from the start and stop at the first already-seen id.
 *
 * Reads through the `GridPlatform.store` because the React tree only has
 * access to the platform (via `<GridProvider>`), not the per-module
 * `PlatformHandle` (which is internal to `module.activate(...)`).
 */

import { useEffect, useRef } from 'react';
import { toast } from '@wellsfargo-starui/react';
import type {
  AlertNotification,
  AlertsState,
  AlertSeverity,
  GridPlatform,
} from '@wellsfargo-starui/core';

const MODULE_ID = 'alerts';

const SEVERITY_TO_VARIANT: Record<AlertSeverity, 'default' | 'destructive'> = {
  info: 'default',
  success: 'default',
  warning: 'default',
  critical: 'destructive',
};

export function useAlertsToastBridge(platform: GridPlatform | null): void {
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!platform) return;
    const store = platform.store;
    const seen = seenIdsRef.current;

    const initial = store.getModuleState<AlertsState | undefined>(MODULE_ID);
    if (initial?.history) for (const n of initial.history) seen.add(n.id);

    return store.subscribeToModule<AlertsState | undefined>(MODULE_ID, (state) => {
      if (!state) return;
      const fresh: AlertNotification[] = [];
      for (const n of state.history) {
        if (seen.has(n.id)) break;
        fresh.push(n);
      }
      if (fresh.length === 0) return;

      const settings = state.settings;
      const channelOn = settings.enabled && settings.enabledChannels.toast;

      const rulesById = new Map(state.rules.map((r) => [r.id, r]));

      for (let i = fresh.length - 1; i >= 0; i -= 1) {
        const n = fresh[i];
        seen.add(n.id);
        if (!channelOn) continue;
        const rule = rulesById.get(n.ruleId);
        if (!rule?.channels.includes('toast')) continue;
        toast({
          title: n.ruleName,
          description: n.message,
          variant: SEVERITY_TO_VARIANT[n.severity],
        });
      }
    });
  }, [platform]);
}
