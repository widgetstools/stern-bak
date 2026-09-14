/**
 * Admin actions, the in-browser dialogs, and the two host APIs the grid
 * customizer's Custom Settings panel reads (`providerGridHost`,
 * `gridEventBindingsHost`) for {@link BlotterHost}. Same behaviour as
 * `MarketsGridContainer`.
 */
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type {
  AdminAction,
  GridEventBindingsHostApi,
  MarketsGridEventHandlerRegistry,
  MarketsGridHandlerMeta,
  ProviderGridHostApi,
} from '@wellsfargo-starui/grid';
import { MARKETS_GRID_EVENT_CATALOG } from '@wellsfargo-starui/grid';
import { createConfigBrowserAction } from '@wellsfargo-starui/grid/config-browser';
import { isOpenFinRuntime } from '../../container/markets-grid-container/openFinRuntime.js';
import type { ProviderMode, ProviderSelection } from '../../container/markets-grid-container/gridLevelState.js';

/** Stable id for overflow-menu e2e (`admin-action-data-provider-editor`). */
export const DATA_PROVIDER_EDITOR_ACTION_ID = 'data-provider-editor';

export function mergeAdminActions(prepend: AdminAction[], infra: AdminAction[], user: AdminAction[]): AdminAction[] {
  const userIds = new Set(user.map((a) => a.id));
  return [...prepend, ...infra.filter((a) => !userIds.has(a.id)), ...user];
}

export interface BlotterAdminActionsArgs {
  activeId: string | null;
  providerName: string | null;
  userAdminActions: AdminAction[];
  onEditProvider?: (providerId: string | null) => void;
  onOpenConfigBrowser?: () => void;
  refreshView: () => void;
  reloadFromSource: () => Promise<void>;
}

export interface BlotterAdminActions {
  /** Refresh / reload + infra + caller actions — for the data grid. */
  withData: AdminAction[];
  /** Infra + caller actions — for the empty grid. */
  infraOnly: AdminAction[];
  handleProviderEdit: (providerId: string | null) => void;
  /** Browser-runtime dialog state (OpenFin hosts get the callbacks instead). */
  dialogs: { providerEditorOpen: boolean; editingProviderId: string | null; configBrowserOpen: boolean };
  setProviderEditorOpen: (open: boolean) => void;
  setConfigBrowserOpen: Dispatch<SetStateAction<boolean>>;
}

export function useBlotterAdminActions(args: BlotterAdminActionsArgs): BlotterAdminActions {
  const { activeId, providerName, userAdminActions, onEditProvider, onOpenConfigBrowser, refreshView, reloadFromSource } = args;
  const [providerEditorOpen, setEditorOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [configBrowserOpen, setConfigBrowserOpen] = useState(false);

  const handleProviderEdit = useCallback((providerId: string | null) => {
    if (isOpenFinRuntime()) { onEditProvider?.(providerId); return; }
    setEditingProviderId(providerId);
    setEditorOpen(true);
  }, [onEditProvider]);
  const handleOpenConfigBrowser = useCallback(() => {
    if (isOpenFinRuntime()) { onOpenConfigBrowser?.(); return; }
    setConfigBrowserOpen(true);
  }, [onOpenConfigBrowser]);
  const setProviderEditorOpen = useCallback((open: boolean) => {
    setEditorOpen(open);
    if (!open) setEditingProviderId(null);
  }, []);

  const infra = useMemo<AdminAction[]>(() => [
    { id: DATA_PROVIDER_EDITOR_ACTION_ID, label: 'Data Provider Editor', description: 'Edit provider configs, STOMP paths, and field mappings', icon: 'lucide:plug', onClick: () => handleProviderEdit(activeId ?? null) },
    createConfigBrowserAction({ launch: handleOpenConfigBrowser }),
  ], [activeId, handleProviderEdit, handleOpenConfigBrowser]);
  const refreshReload = useMemo<AdminAction[]>(() => [
    { id: 'refresh-view', label: 'Refresh view', description: providerName ? `Replay cached rows for ${providerName} without reconnecting` : 'Replay cached rows without reconnecting', icon: 'lucide:refresh-cw', onClick: refreshView },
    { id: 'reload-from-source', label: 'Reload from source', description: providerName ? `Restart ${providerName} and re-fetch the snapshot` : 'Restart the active provider and re-fetch the snapshot', icon: 'lucide:rotate-cw', onClick: reloadFromSource },
  ], [providerName, refreshView, reloadFromSource]);

  return {
    withData: useMemo(() => mergeAdminActions(refreshReload, infra, userAdminActions), [refreshReload, infra, userAdminActions]),
    infraOnly: useMemo(() => mergeAdminActions([], infra, userAdminActions), [infra, userAdminActions]),
    handleProviderEdit,
    dialogs: { providerEditorOpen, editingProviderId, configBrowserOpen },
    setProviderEditorOpen,
    setConfigBrowserOpen,
  };
}

export interface BlotterHostApisArgs {
  providers: ProviderGridHostApi['liveProviders'];
  selection: ProviderSelection;
  asOfDate: string | null;
  setLiveId: (id: string | null) => void;
  setHistoricalId: (id: string | null) => void;
  setMode: (mode: ProviderMode) => void;
  setAsOfDateAndPersist: (next: string | null) => void;
  refreshView: () => void;
  reloadFromSource: () => Promise<void>;
  handleProviderEdit: (providerId: string | null) => void;
  eventBindings: Record<string, string[]>;
  setEventBindings: Dispatch<SetStateAction<Record<string, string[]>>>;
  gridEventHandlers?: MarketsGridEventHandlerRegistry;
  handlerMeta?: MarketsGridHandlerMeta;
}

/** The Custom Settings host APIs: provider pickers / actions and event-callback bindings. */
export function useBlotterHostApis(a: BlotterHostApisArgs): { providerGridHost: ProviderGridHostApi; gridEventBindingsHost: GridEventBindingsHostApi } {
  const { providers, selection, asOfDate, setLiveId, setHistoricalId, setMode, setAsOfDateAndPersist, refreshView, reloadFromSource, handleProviderEdit, eventBindings, setEventBindings, gridEventHandlers, handlerMeta } = a;
  const setBindings = useCallback((next: Record<string, string[]>) => { setEventBindings(next); }, [setEventBindings]);
  const setEventHandler = useCallback((eventId: string, handlerId: string | null) => {
    setEventBindings((prev) => {
      const next = { ...prev };
      if (!handlerId) delete next[eventId]; else next[eventId] = [handlerId];
      return next;
    });
  }, [setEventBindings]);

  const gridEventBindingsHost = useMemo<GridEventBindingsHostApi>(() => ({
    available: Boolean(gridEventHandlers),
    bindings: eventBindings,
    catalog: MARKETS_GRID_EVENT_CATALOG,
    handlerIds: gridEventHandlers ? Object.keys(gridEventHandlers) : [],
    handlerMeta,
    setBindings,
    setEventHandler,
  }), [gridEventHandlers, eventBindings, handlerMeta, setBindings, setEventHandler]);

  const providerGridHost = useMemo<ProviderGridHostApi>(() => ({
    available: true,
    liveProviders: providers,
    historicalProviders: providers,
    liveProviderId: selection.liveProviderId,
    historicalProviderId: selection.historicalProviderId,
    mode: selection.mode,
    asOfDate,
    onLiveChange: setLiveId,
    onHistoricalChange: setHistoricalId,
    onModeChange: setMode,
    onAsOfDateChange: setAsOfDateAndPersist,
    onRefreshView: refreshView,
    onReloadFromSource: () => { void reloadFromSource(); },
    onEditProvider: handleProviderEdit,
  }), [providers, selection.liveProviderId, selection.historicalProviderId, selection.mode, asOfDate, setLiveId, setHistoricalId, setMode, setAsOfDateAndPersist, refreshView, reloadFromSource, handleProviderEdit]);

  return { providerGridHost, gridEventBindingsHost };
}
