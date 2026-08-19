/**
 * The SSRM container's Tools menu, byte-for-byte `MarketsGridContainer`'s:
 * the refresh/reload pair, then the data-infrastructure pair, then whatever
 * the host supplied — same ids, labels, icons and order, merged through the
 * shared {@link mergeAdminActions} so a host entry wins on id collision.
 *
 * Two lists come back. `full` is for a grid with a bound provider; `infraOnly`
 * drops the refresh/reload pair for the no-provider shell, where there is
 * nothing to refresh but repairing the provider is the whole point of the
 * menu being there.
 */
import { useMemo } from 'react';
import type { AdminAction } from '@wellsfargo-starui/grid/core';
import { createConfigBrowserAction } from '@wellsfargo-starui/grid/config-browser';
import {
  DATA_PROVIDER_EDITOR_ACTION_ID,
  mergeAdminActions,
} from '../markets-grid-container/mergeAdminActions.js';

export interface UseSsrmAdminActionsParams {
  /** Host-supplied entries, merged last. */
  hostActions: AdminAction[] | undefined;
  /** The id the Data Provider Editor opens on. */
  editProviderId: string;
  onEditProvider: (id: string | null) => void;
  onOpenConfigBrowser: () => void;
  onRefreshView: () => void;
  onReloadFromSource: () => void;
}

export interface SsrmAdminActions {
  full: AdminAction[];
  infraOnly: AdminAction[];
}

export function useSsrmAdminActions(
  params: UseSsrmAdminActionsParams,
): SsrmAdminActions {
  const {
    hostActions,
    editProviderId,
    onEditProvider,
    onOpenConfigBrowser,
    onRefreshView,
    onReloadFromSource,
  } = params;

  const infra = useMemo<AdminAction[]>(() => [
    {
      id: DATA_PROVIDER_EDITOR_ACTION_ID,
      label: 'Data Provider Editor',
      description: 'Edit provider configs, STOMP paths, and field mappings',
      icon: 'lucide:plug',
      onClick: () => onEditProvider(editProviderId),
    },
    createConfigBrowserAction({ launch: onOpenConfigBrowser }),
  ], [editProviderId, onEditProvider, onOpenConfigBrowser]);

  const refreshReload = useMemo<AdminAction[]>(() => [
    {
      id: 'refresh-view',
      label: 'Refresh view',
      description: 'Replay cached rows from the worker plane without reconnecting',
      icon: 'lucide:refresh-cw',
      onClick: onRefreshView,
    },
    {
      id: 'reload-from-source',
      label: 'Reload from source',
      description: 'Restart the provider and re-fetch the snapshot — refreshes every subscribed grid',
      icon: 'lucide:rotate-cw',
      onClick: onReloadFromSource,
    },
  ], [onRefreshView, onReloadFromSource]);

  // Memoised so a host that passes no `adminActions` does not hand both
  // merges a fresh `[]` on every render.
  const host = useMemo(() => hostActions ?? EMPTY_ACTIONS, [hostActions]);

  const full = useMemo(
    () => mergeAdminActions(refreshReload, infra, host),
    [refreshReload, infra, host],
  );
  const infraOnly = useMemo(
    () => mergeAdminActions([], infra, host),
    [infra, host],
  );

  return { full, infraOnly };
}

const EMPTY_ACTIONS: AdminAction[] = [];
