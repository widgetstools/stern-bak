/**
 * The hosted-view side of {@link BlotterHost}: identity resolution, theme,
 * tab visibility, the tab-name ↔ caption binding, workspace-save flushes,
 * grid-to-grid context linking, document title and the one-shot legacy
 * cleanup. Everything here lived in `HostedMarketsGrid`; the behaviour is
 * unchanged, only gathered behind one hook so the host component reads as
 * the state machine it drives.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { Theme } from 'ag-grid-community';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid';
import type { HostedContext } from '../../hosted/types.js';
import type { AgGridThemeMode } from '../../hosted/useAgGridTheme.js';
import { useHostedView } from '../../hosted/useHostedView.js';
import { useViewTabTitle } from '../../hosted/useViewTabTitle.js';
import { useGridContextLink, type GridContextLinkConfig } from '../../hosted/useGridContextLink.js';
import { useGridLinkNotifications } from '../../hosted/useGridLinkNotifications.js';
import { useInteropChannel, isInteropAvailable } from '../../hosted/useInteropChannel.js';

const LEGACY_CLEANUP_SENTINEL = 'hosted-mg.legacy-cleanup';

export interface BlotterViewFeaturesArgs {
  componentName: string;
  defaultInstanceId: string;
  defaultAppId?: string;
  defaultUserId?: string;
  withStorage: boolean;
  configManager?: HostedContext['configManager'] | undefined;
  theme: AgGridThemeMode;
  documentTitle?: string;
  caption?: string;
  contextLink?: GridContextLinkConfig;
  onReady?: (handle: MarketsGridHandle) => void;
  onCaptionChange?: (next: string) => void;
}

export interface BlotterViewFeatures {
  identity: HostedContext;
  /** `identity.instanceId` has resolved. */
  ready: boolean;
  agTheme: Theme;
  tabsHidden: boolean;
  /** Caption to render: the live tab name, else the prop, else the component name. */
  headerCaption: string;
  /** Toolbar caption edits seed the tab name, then reach the consumer. */
  handleCaptionChange: (next: string) => void;
  /** Captures the grid handle for workspace saves and context linking, then chains the consumer's. */
  handleReady: (handle: MarketsGridHandle) => void;
  /** Feeds the resolved key column(s) into context linking; `undefined` when linking is off. */
  onRowIdFieldChange: ((rowIdField: string | readonly string[] | null) => void) | undefined;
}

/** Flush grid state on view teardown — workspace drag/move does not fire `workspace-saving`. */
function useTeardownFlush(onWorkspaceSave: () => Promise<void>): void {
  useEffect(() => {
    const flush = () => { void onWorkspaceSave(); };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    let view: { on?: (event: string, cb: () => void) => void; removeListener?: (event: string, cb: () => void) => void } | null = null;
    try {
      if (typeof fin !== 'undefined' && typeof fin.View?.getCurrentSync === 'function') {
        view = fin.View.getCurrentSync();
        view?.on?.('destroyed', flush);
      }
    } catch { /* not inside an OpenFin view */ }
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      flush();
      try { view?.removeListener?.('destroyed', flush); } catch { /* view already torn down */ }
    };
  }, [onWorkspaceSave]);
}

/** One-shot legacy `marketsgrid-view-state::*` cleanup, sentinel-gated per browser. */
function useLegacyCleanup(identity: HostedContext): void {
  useEffect(() => {
    if (!identity.configManager || !identity.instanceId) return;
    try {
      if (window.localStorage.getItem(LEGACY_CLEANUP_SENTINEL) === '1') return;
    } catch { return; }
    void identity.configManager
      .deleteConfig(`marketsgrid-view-state::${identity.instanceId}`)
      .catch(() => { /* no row to clean */ })
      .finally(() => {
        try { window.localStorage.setItem(LEGACY_CLEANUP_SENTINEL, '1'); } catch { /* ignore */ }
      });
  }, [identity.configManager, identity.instanceId]);
}

export function useBlotterViewFeatures(args: BlotterViewFeaturesArgs): BlotterViewFeatures {
  const { componentName, defaultInstanceId, caption, contextLink, documentTitle, onReady, onCaptionChange } = args;
  const gridRef = useRef<MarketsGridHandle | null>(null);
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const [linkRowIdField, setLinkRowIdField] = useState<string | readonly string[] | null>(null);
  const linkActive = contextLink?.enabled === true;

  const handleReady = useCallback((handle: MarketsGridHandle) => {
    gridRef.current = handle;
    if (linkActive) setGridApi(handle.gridApi as unknown as GridApi);
    onReady?.(handle);
  }, [onReady, linkActive]);

  // Same path as the toolbar Save button (busy overlay + grid-state capture).
  const onWorkspaceSave = useCallback(async () => {
    const handle = gridRef.current;
    if (handle?.saveAll) { await handle.saveAll(); return; }
    if (handle?.profiles?.saveActiveProfile) await handle.profiles.saveActiveProfile();
  }, []);

  const { identity, ready, agTheme, tabsHidden, linking } = useHostedView({
    defaultInstanceId,
    defaultAppId: args.defaultAppId,
    defaultUserId: args.defaultUserId,
    withStorage: args.withStorage,
    configManager: args.configManager ?? undefined,
    componentName,
    theme: args.theme,
    onWorkspaceSave,
  });
  useTeardownFlush(onWorkspaceSave);

  const { title: tabTitle, setTitle: writeTabTitle } = useViewTabTitle(caption ?? componentName);
  const handleCaptionChange = useCallback((next: string) => {
    writeTabTitle(next);
    onCaptionChange?.(next);
  }, [writeTabTitle, onCaptionChange]);

  const instanceId = identity.instanceId ?? defaultInstanceId;
  const linkNotifications = useGridLinkNotifications({ instanceId, enabled: linkActive && contextLink?.notify === true });
  const interopChannel = useInteropChannel({ debug: contextLink?.debug === true });
  const effectiveContextLink = useMemo<GridContextLinkConfig | undefined>(() => {
    if (!contextLink) return contextLink;
    const resolved = linkRowIdField ?? contextLink.rowIdField ?? undefined;
    return resolved !== undefined ? { ...contextLink, rowIdField: resolved } : contextLink;
  }, [contextLink, linkRowIdField]);
  useGridContextLink({
    gridApi,
    fdc3: isInteropAvailable() ? interopChannel : linking.fdc3,
    instanceId,
    config: effectiveContextLink,
    onPublish: linkNotifications.onPublish,
    onReceive: linkNotifications.onReceive,
  });

  useEffect(() => {
    const prev = document.title;
    document.title = documentTitle ?? componentName;
    return () => { document.title = prev; };
  }, [componentName, documentTitle]);
  useLegacyCleanup(identity);

  return {
    identity,
    ready,
    agTheme,
    tabsHidden,
    headerCaption: tabTitle || caption || componentName,
    handleCaptionChange,
    handleReady,
    onRowIdFieldChange: linkActive ? setLinkRowIdField : undefined,
  };
}
