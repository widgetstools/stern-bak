/**
 * useGridLinkNotifications — posts OpenFin Notification Center messages for
 * grid-to-grid color linking. Returns the `onPublish` / `onReceive`
 * callbacks `useGridContextLink` invokes:
 *
 *   • onPublish: this grid broadcast its selected row's key column + value to
 *     linked peers → post "Linked selection sent".
 *   • onReceive: a peer's selection arrived → post an acknowledgement
 *     "Linked selection received".
 *
 * The OpenFin dependency lives entirely in `@wellsfargo-starui/host-openfin` (per
 * docs/ARCHITECTURE.md the framework layer must not import `@openfin/*`
 * directly) — we consume the injected `loadOpenFinNotificationsApi` /
 * `dispatchOpenFinNotification` seam, exactly like the grid's alerts bridge.
 *
 * Everything no-ops outside an OpenFin runtime (no `fin` global) or when
 * `enabled` is false, so the callbacks are always safe to wire up.
 */

import { useCallback, useRef } from 'react';
import {
  loadOpenFinNotificationsApi,
  dispatchOpenFinNotification,
  type OpenFinNotificationsApi,
} from '@wellsfargo-starui/host-openfin';
import type { GridLinkSelectionContext } from './gridContextLink.js';
import {
  buildSelectionNotification,
  buildAckNotification,
  type GridLinkNotificationContent,
} from './gridLinkNotifications.js';

interface FinGlobal {
  me?: { identity?: { uuid?: string } };
}

function getFin(): FinGlobal | null {
  if (typeof window === 'undefined') return null;
  const fin = (window as unknown as { fin?: FinGlobal }).fin;
  return fin && typeof fin === 'object' ? fin : null;
}

export interface UseGridLinkNotificationsArgs {
  /** This view's instance id — used as the ack's `to` and to label the peer. */
  instanceId: string;
  /** Master switch. When false the callbacks are inert. */
  enabled: boolean;
}

export interface GridLinkNotificationCallbacks {
  /** Call after this grid broadcasts a selection to linked peers. */
  onPublish: (context: GridLinkSelectionContext) => void;
  /** Call when a peer's selection is received + applied. */
  onReceive: (context: GridLinkSelectionContext) => void;
}

export function useGridLinkNotifications({
  instanceId,
  enabled,
}: UseGridLinkNotificationsArgs): GridLinkNotificationCallbacks {
  // `undefined` = not yet loaded, `null` = unavailable (non-OpenFin host).
  const apiRef = useRef<OpenFinNotificationsApi | null | undefined>(undefined);
  const loadingRef = useRef<Promise<OpenFinNotificationsApi | null> | null>(null);

  const getApi = useCallback(async (): Promise<OpenFinNotificationsApi | null> => {
    if (apiRef.current !== undefined) return apiRef.current;
    if (!loadingRef.current) loadingRef.current = loadOpenFinNotificationsApi();
    const api = await loadingRef.current;
    apiRef.current = api;
    return api;
  }, []);

  const dispatch = useCallback(
    (content: GridLinkNotificationContent | null) => {
      if (!enabled || !content) return;
      if (!getFin()) return; // non-OpenFin host — nothing to post to.
      void (async () => {
        const api = await getApi();
        if (!api) return;
        await dispatchOpenFinNotification(api, {
          platformUuid: getFin()?.me?.identity?.uuid,
          title: content.title,
          body: content.body,
          category: content.category,
          customData: content.customData,
        });
      })();
    },
    [enabled, getApi],
  );

  const onPublish = useCallback(
    (context: GridLinkSelectionContext) => dispatch(buildSelectionNotification(context)),
    [dispatch],
  );

  const onReceive = useCallback(
    (context: GridLinkSelectionContext) => dispatch(buildAckNotification(context, { instanceId })),
    [dispatch, instanceId],
  );

  return { onPublish, onReceive };
}
