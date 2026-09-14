/**
 * BlotterHost — one component from a blotter's identity to its grid
 * (refactor plan D1). It replaces the HostedMarketsGrid → MarketsGridContainer
 * stack with a single host driven by {@link resolveBlotterHostStep}:
 *
 *   identity → storage → selection → config → grid
 *
 * The outer host settles identity and storage (the hosted-view features live
 * in `useBlotterViewFeatures`) and mounts the data plane for the body; the body
 * gathers the remaining facts (grid-level data, the active provider's row and
 * config) and renders exactly one `MarketsGrid` — the data grid keyed by
 * provider + key column, or the empty grid when there is definitely nothing
 * to attach. Before that there is one loading note, never a grid that a later
 * phase replaces (WORKLOG 20). `MarketsGrid` and the customizer are unchanged.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ColDef } from 'ag-grid-community';
import type { AppDataLookup } from '@wellsfargo-starui/core';
import { MarketsGrid, createMarketsGridContainerEventBus, useMarketsGridEventBridge } from '@wellsfargo-starui/grid';
import type { AdminAction, MarketsGridHandle, MarketsGridProps, StorageAdapterFactory } from '@wellsfargo-starui/grid';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import { DataHubProvider, DataServicesProvider, useAppDataStore } from '@wellsfargo-starui/react/data/runtime';
import { ConfigBrowserDialog } from '../container/markets-grid-container/ConfigBrowserDialog.js';
import { ProviderEditorDialog } from '../container/markets-grid-container/ProviderEditorDialog.js';
import { MarketsGridLoadingOverlay } from '../container/markets-grid-container/LoadingOverlay.js';
import {
  EMPTY_GRID_KEY,
  EMPTY_GRID_ROW_ID_FIELD,
  blotterHostLoadingMessage,
  isGridStep,
  resolveBlotterHostStep,
  type BlotterHostStep,
} from './blotterHostMachine.js';
import type { BlotterHostProps } from './host/blotterHostTypes.js';
import { useBlotterViewFeatures, type BlotterViewFeatures } from './host/useBlotterViewFeatures.js';
import { useBlotterGridLevel } from './host/useBlotterGridLevel.js';
import { useBlotterToolbarDate } from './host/useBlotterToolbarDate.js';
import { useBlotterActiveProvider } from './host/useBlotterActiveProvider.js';
import { useBlotterDataFeed } from './host/useBlotterDataFeed.js';
import { useBlotterAdminActions, useBlotterHostApis, type BlotterAdminActions } from './host/useBlotterAdminApis.js';

export type { BlotterHostProps, BlotterHostGridProps } from './host/blotterHostTypes.js';

const EMPTY: never[] = [];
const FULL_BLEED_STYLE = { position: 'fixed' as const, inset: 0, display: 'flex' as const, flexDirection: 'column' as const, background: 'var(--ds-surface-ground)', color: 'var(--ds-text-primary)', overflow: 'hidden' as const };
const INNER_FILL_STYLE = { flex: 1, minHeight: 0, position: 'relative' as const };
const GRID_FILL_STYLE = { position: 'relative' as const, height: '100%', minHeight: 0 };
const LOADING_STYLE = { display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, height: '100%', fontSize: 12, color: 'var(--ds-text-muted)' };

function defaultOnError(err: Error): void {
  console.error('[BlotterHost]', err);
}

/** The single pre-grid state. */
function LoadingNote({ message }: { message: string }): ReactNode {
  return <div style={LOADING_STYLE}>{message}</div>;
}

/** AppDataStore → the platform's `resources.appData()` shape (cell-editor `{{name.key}}` bindings). */
function useAppDataLookup(store: ReturnType<typeof useAppDataStore>['store']): AppDataLookup {
  return useMemo<AppDataLookup>(() => ({
    get: (name, key) => store.get(name, key),
    listProviders: () => store.list().map((row) => row.name),
    keysOf: (name) => { const row = store.list().find((r) => r.name === name); return row ? Object.keys(row.values) : []; },
    subscribe: (fn) => store.subscribe(fn),
    set: (name, key, value) => { void store.set(name, key, value); },
  }), [store]);
}

// ─── Outer host: identity + storage, data plane, layout ─────────────────────

export function BlotterHost<TData extends Record<string, unknown> = Record<string, unknown>>(props: BlotterHostProps<TData>): ReactNode {
  const {
    componentName, defaultInstanceId, defaultAppId, defaultUserId, documentTitle, withStorage = false, storage: explicitStorage,
    configManager, theme = 'auto', dataServices, platform, dataServicesMode = 'lazy', caption, contextLink, onReady, onCaptionChange,
    onRowIdFieldChange, children: _children, ...bodyProps
  } = props;
  const view = useBlotterViewFeatures({ componentName, defaultInstanceId, defaultAppId, defaultUserId, withStorage, configManager, theme, documentTitle, caption, contextLink, onReady, onCaptionChange });
  const storage = explicitStorage ?? view.identity.storage;
  const linkRowIdField = view.onRowIdFieldChange;
  const rowIdFieldChange = useCallback((rowIdField: string | readonly string[] | null) => {
    linkRowIdField?.(rowIdField);
    onRowIdFieldChange?.(rowIdField);
  }, [linkRowIdField, onRowIdFieldChange]);

  const gate = resolveBlotterHostStep({
    identityReady: view.ready && view.identity.instanceId !== null,
    configManagerReady: view.identity.configManager !== null,
    storagePending: withStorage && !storage,
    gridLevelLoaded: false, activeProviderId: null, providerConfig: { loading: false, present: false, error: false }, rowIdFieldKey: null, columnDefsReady: false, ssrm: false,
  });
  const content = gate.phase === 'identity' || gate.phase === 'storage'
    ? <LoadingNote message={blotterHostLoadingMessage(gate, null) ?? ''} />
    : (
      <BlotterHostBody<TData>
        {...(bodyProps as BlotterBodyProps<TData>)}
        componentName={componentName}
        instanceId={view.identity.instanceId as string}
        appId={view.identity.appId}
        userId={view.identity.userId}
        storage={storage}
        view={view}
        onRowIdFieldChange={linkRowIdField || onRowIdFieldChange ? rowIdFieldChange : undefined}
      />
    );
  const wrapped = !view.identity.configManager ? content
    : platform ? <DataHubProvider platform={platform} mode={dataServicesMode} userId={view.identity.userId}>{content}</DataHubProvider>
      : dataServices ? <DataServicesProvider services={dataServices} mode={dataServicesMode} userId={view.identity.userId}>{content}</DataServicesProvider>
        : content;
  return (
    <>
      <style>{'html, body { padding: 0 !important; margin: 0 !important; overflow: hidden !important; }'}</style>
      <div style={FULL_BLEED_STYLE}><div style={INNER_FILL_STYLE}>{wrapped}</div></div>
    </>
  );
}

// ─── Body: selection → config → grid, inside the data plane ─────────────────

type BodyOwnKeys = 'componentName' | 'defaultInstanceId' | 'defaultAppId' | 'defaultUserId' | 'documentTitle' | 'withStorage' | 'storage' | 'configManager' | 'theme' | 'dataServices' | 'platform' | 'dataServicesMode' | 'caption' | 'contextLink' | 'onReady' | 'onCaptionChange' | 'onRowIdFieldChange' | 'children';

interface BlotterBodyProps<TData extends Record<string, unknown>> extends Omit<BlotterHostProps<TData>, BodyOwnKeys> {
  componentName: string;
  instanceId: string;
  appId: string;
  userId: string;
  storage: StorageAdapterFactory | null;
  view: BlotterViewFeatures;
  onRowIdFieldChange?: (rowIdField: string | readonly string[] | null) => void;
}

function useBlotterBody<TData extends Record<string, unknown>>(p: BlotterBodyProps<TData>) {
  const { instanceId, appId, userId, storage, view, onRowIdFieldChange, historicalDateAppDataRef, onEditProvider, onOpenConfigBrowser, defaultLiveProviderId, defaultHistoricalProviderId, gridEventHandlers, handlerMeta, gridId } = p;
  const onError = p.onError ?? defaultOnError;
  const containerEventBus = useMemo(() => createMarketsGridContainerEventBus(), []);
  const [gridHandle, setGridHandle] = useState<MarketsGridHandle | null>(null);
  const gridHandleRef = useRef<MarketsGridHandle | null>(null);
  const appData = useAppDataStore();
  const appDataLookup = useAppDataLookup(appData.store);

  const gridLevel = useBlotterGridLevel({ storage, gridId, instanceId, appId, userId, defaultLiveProviderId, defaultHistoricalProviderId, gridHandle, gridHandleRef, propCaption: view.headerCaption, onCaptionChange: view.handleCaptionChange });
  const { loaded, selection, setSelection, setMode } = gridLevel;
  const toolbar = useBlotterToolbarDate({ loaded, selection, setSelection, setMode, historicalDateAppDataRef, defaultHistoricalProviderId, appDataStore: appData.store, containerEventBus, onError });
  const active = useBlotterActiveProvider<TData>({ gridId, selection, onRowIdFieldChange });
  const step: BlotterHostStep = resolveBlotterHostStep({
    identityReady: true, configManagerReady: true, storagePending: false,
    gridLevelLoaded: loaded, activeProviderId: active.activeId,
    providerConfig: { loading: active.row.loading, present: active.row.cfg != null, error: Boolean(active.row.error) },
    rowIdFieldKey: active.rowIdFieldKey, columnDefsReady: active.columnDefs !== null, ssrm: active.isSsrm,
  });
  const gridKey = step.phase === 'grid' && step.grid === 'data' ? step.key : null;
  const feed = useBlotterDataFeed<TData>({ active, gridKey, loaded, selection, asOfDate: toolbar.asOfDate, toolbarDate: toolbar.toolbarDate, pendingReloadRef: toolbar.pendingReloadRef, historicalDateAppDataRef, appDataStore: appData.store, containerEventBus, gridHandle, onError });

  const { stampGridApi } = feed;
  const { handleReady: viewOnReady } = view;
  const handleReady = useCallback((handle: MarketsGridHandle) => {
    stampGridApi(handle);
    gridHandleRef.current = handle;
    setGridHandle(handle);
    viewOnReady(handle);
  }, [stampGridApi, viewOnReady]);
  useMarketsGridEventBridge({ handle: gridHandle, gridId, instanceId, appId, userId, appData: appDataLookup, eventBindings: gridLevel.eventBindings, handlers: gridEventHandlers, containerBus: containerEventBus });

  const userAdminActions = useMemo<AdminAction[]>(() => p.adminActions ?? [], [p.adminActions]);
  const admin = useBlotterAdminActions({ activeId: active.activeId, providerName: active.providerName, userAdminActions, onEditProvider, onOpenConfigBrowser, refreshView: feed.refreshView, reloadFromSource: feed.reloadFromSource });
  const apis = useBlotterHostApis({
    providers: active.providers, selection, asOfDate: toolbar.asOfDate, setLiveId: gridLevel.setLiveId, setHistoricalId: gridLevel.setHistoricalId, setMode,
    setAsOfDateAndPersist: toolbar.setAsOfDateAndPersist, refreshView: feed.refreshView, reloadFromSource: feed.reloadFromSource, handleProviderEdit: admin.handleProviderEdit,
    eventBindings: gridLevel.eventBindings, setEventBindings: gridLevel.setEventBindings, gridEventHandlers, handlerMeta,
  });
  return { step, gridLevel, toolbar, active, feed, admin, apis, appDataLookup, handleReady };
}

function BlotterHostDialogs({ admin, userId }: { admin: BlotterAdminActions; userId: string }): ReactNode {
  return (
    <>
      <ProviderEditorDialog open={admin.dialogs.providerEditorOpen} providerId={admin.dialogs.editingProviderId} userId={userId || LOGGED_IN_USER_ID} onOpenChange={admin.setProviderEditorOpen} />
      <ConfigBrowserDialog open={admin.dialogs.configBrowserOpen} onOpenChange={admin.setConfigBrowserOpen} />
    </>
  );
}

/** Load-timing marks (measurement only): the body mounted; the step first reached `grid`. */
function useBlotterLoadMarks(step: BlotterHostStep): void {
  const marked = useRef(false);
  useEffect(() => { markOnce('starui:blotter-body'); }, []);
  useEffect(() => {
    if (marked.current || !isGridStep(step)) return;
    marked.current = true;
    markOnce('starui:blotter-grid');
  }, [step]);
}
function markOnce(name: string): void {
  try {
    if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
    if (performance.getEntriesByName(name, 'mark').length === 0) performance.mark(name);
  } catch { /* measurement must never break the host */ }
}

function BlotterHostBody<TData extends Record<string, unknown>>(p: BlotterBodyProps<TData>): ReactNode {
  const { step, gridLevel, toolbar, active, feed, admin, apis, appDataLookup, handleReady } = useBlotterBody(p);
  useBlotterLoadMarks(step);
  const { view, storage, instanceId, appId, userId, componentName } = p;
  const dialogs = <BlotterHostDialogs admin={admin} userId={userId} />;
  if (!isGridStep(step)) {
    return <><LoadingNote message={blotterHostLoadingMessage(step, active.providerName) ?? ''} />{dialogs}</>;
  }
  const {
    historicalDateAppDataRef: _h, onEditProvider: _e, onOpenConfigBrowser: _o, onError: _err, defaultLiveProviderId: _l, defaultHistoricalProviderId: _hp,
    gridEventHandlers: _g, handlerMeta: _m, view: _v, storage: _s, onRowIdFieldChange: _r, adminActions: _a, ...gridProps
  } = p;
  const common = {
    ...(gridProps as unknown as MarketsGridProps<TData>),
    instanceId, appId, userId, componentName, storage: storage ?? undefined, theme: view.agTheme, tabsHidden: view.tabsHidden,
    rowData: EMPTY as TData[], appData: appDataLookup, providerGridHost: apis.providerGridHost, gridEventBindingsHost: apis.gridEventBindingsHost,
    caption: gridLevel.effectiveCaption, onCaptionChange: gridLevel.handleCaptionChange,
    toolbarDate: toolbar.toolbarDate, onToolbarDateChange: toolbar.handleToolbarDateChange, toolbarDateHistoryEnabled: toolbar.toolbarDateHistoryEnabled,
  };
  if (step.grid === 'empty') {
    // No provider, or a row without key / columns: the grid Custom Settings picks or repairs the provider from.
    return <><MarketsGrid<TData> {...common} key={EMPTY_GRID_KEY} rowIdField={EMPTY_GRID_ROW_ID_FIELD} columnDefs={EMPTY as unknown as ColDef<TData>[]} adminActions={admin.infraOnly} />{dialogs}</>;
  }
  return (
    <>
      <div style={GRID_FILL_STYLE}>
        <MarketsGrid<TData>
          {...common}
          key={step.key}
          ssrm={feed.ssrm}
          rowIdField={active.rowIdField as string | readonly string[]}
          columnDefs={active.columnDefs as ColDef<TData>[]}
          onReady={handleReady}
          adminActions={admin.withData}
          onSavingChange={feed.setIsSavingProfile}
          dataStale={feed.providerDisconnected}
          dataStaleMessage={feed.dataStaleMessage}
          historicalViewMode={toolbar.isHistoricalView}
          historicalViewMessage={toolbar.historicalViewMessage}
        />
        {feed.showLoadingOverlay && <MarketsGridLoadingOverlay title={feed.overlayTitle} message={feed.overlayMessage} rowCount={feed.overlayRowCount} />}
      </div>
      {dialogs}
    </>
  );
}
