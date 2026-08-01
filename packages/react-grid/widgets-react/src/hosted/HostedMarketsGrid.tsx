/**
 * HostedMarketsGrid — single component that collapses the previous
 * BlottersMarketsGrid → HostedFeatureView → HostedComponent →
 * BlotterGrid → MarketsGridContainer → MarketsGrid stack into one
 * call site. Composes the building blocks from sessions 1–3 plus
 * MarketsGridContainer:
 *
 *   <DataServicesProvider>
 *     <FullBleedLayout>
 *       <ConfigManagerLoadingGuard>
 *         <MarketsGridContainer ... />
 *       </ConfigManagerLoadingGuard>
 *     </FullBleedLayout>
 *   </DataServicesProvider>
 *
 * Props are flat (no `gridProps` namespacing) per refactor decision D7.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import type { ResolvedDataServicesHubBundle } from '@wellsfargo-starui/data';
import { DataServicesProvider, DataHubProvider } from '@wellsfargo-starui/react/data/runtime';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid';
import { MarketsGridContainer, type MarketsGridContainerProps } from '../container/markets-grid-container/index.js';
import { useHostedView } from './useHostedView.js';
import { useViewTabTitle } from './useViewTabTitle.js';
import { useGridContextLink, type GridContextLinkConfig } from './useGridContextLink.js';
import { useGridLinkNotifications } from './useGridLinkNotifications.js';
import { useInteropChannel, isInteropAvailable } from './useInteropChannel.js';
import type { AgGridThemeMode } from './useAgGridTheme.js';
import type { ConfigManager } from './types.js';

const LEGACY_CLEANUP_SENTINEL = 'hosted-mg.legacy-cleanup';

/**
 * The subset of `MarketsGridContainerProps` the wrapper owns and
 * therefore omits from passthrough — they are derived from the hosted
 * identity / theme.
 */
type ContainerOwnedKeys =
  | 'instanceId'
  | 'appId'
  | 'userId'
  | 'storage'
  | 'theme'
  | 'componentName';

export interface HostedMarketsGridProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
> extends Omit<MarketsGridContainerProps<TData>, ContainerOwnedKeys> {
  /** Initial caption rendered top-left in the primary toolbar. Falls
   *  back to `componentName`. The caption is always visible and, under
   *  OpenFin, is bound two-way to the view's tab name via
   *  {@link useViewTabTitle}: a "Save Tab As…" rename updates the
   *  caption, and a caption edit seeds the tab name. */
  caption?: string;
  /** Logical component name — surfaces in the toolbar info popover and
   *  is used for diagnostic identifiers. */
  componentName: string;
  /** Default `instanceId` when neither OpenFin customData nor URL param
   *  resolves one. Required so first-run / refresh converge. */
  defaultInstanceId: string;
  /** Default `appId` when OpenFin customData doesn't supply one. */
  defaultAppId?: string;
  /** Default `userId` when OpenFin customData doesn't supply one. */
  defaultUserId?: string;
  /** Document title while this component is mounted. Restored on
   *  unmount. Defaults to `componentName`. */
  documentTitle?: string;
  /** When true, resolve a ConfigService-backed StorageAdapterFactory
   *  from the host ConfigManager and pass it through to the grid. */
  withStorage?: boolean;
  /** Passed to {@link MarketsGridContainer} — auto-select live provider when unset in storage. */
  defaultLiveProviderId?: string;
  /** Optional ConfigManager override. When omitted, the host singleton
   *  is resolved via `@wellsfargo-starui/openfin/config`. Pass an
   *  explicit ConfigManager in tests / non-OpenFin runtimes. */
  configManager?: ConfigManager;
  /** Theme mode for the AG-Grid blotter preset. Defaults to `'auto'`
   *  (follows the host's `[data-theme]` attribute). */
  theme?: AgGridThemeMode;
  /** Optional data-services bundle from `bootstrapDataServices(...)`.
   *  When provided, the wrapper mounts a `<DataServicesProvider>` for
   *  it. Omit when an ancestor already provides data-services context.
   *  Prefer {@link platform} from `ensurePlatformReady()` for new apps. */
  dataServices?: DataServices;
  /** Hub bundle from `ensurePlatformReady()` / `ensureDataServicesHub()`.
   *  Preferred over `dataServices` — exposes `getProvider()` and mounts
   *  {@link DataHubProvider} so `MarketsGridContainer` can use
   *  {@link useDataProvider} against the worker catalog. */
  platform?: ResolvedDataServicesHubBundle;
  /** Hydration mode for the AppData mirror. `'lazy'` (default) renders
   *  immediately and reconciles when the snapshot arrives; `'eager'`
   *  suspends first paint until `dataServices.ready` resolves. Use
   *  eager when the grid's cfg has `{{name.key}}` template references
   *  whose initial values must be resolved on first attach (e.g. a
   *  historical-date blotter keyed off `{{positions.asOfDate}}`). The
   *  consumer's surrounding `<Suspense>` boundary handles the fallback. */
  dataServicesMode?: 'eager' | 'lazy';
  /** Opt-in grid-to-grid context linking over OpenFin's colored "Link"
   *  groups. When `{ enabled: true }`, this grid broadcasts its selection
   *  to linked peers and filters its rows on contexts received from them.
   *  Set `rowIdField` to the provider's `keyColumn` so peers match on the
   *  same fields. See {@link useGridContextLink}. */
  contextLink?: GridContextLinkConfig;
}

function fullBleedReset(): ReactNode {
  return (
    <style>{`
      html, body {
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
      }
    `}</style>
  );
}

const FULL_BLEED_STYLE = {
  position: 'fixed' as const,
  inset: 0,
  display: 'flex' as const,
  flexDirection: 'column' as const,
  background: 'var(--ds-surface-ground)',
  color: 'var(--ds-text-primary)',
  overflow: 'hidden' as const,
};

const INNER_FILL_STYLE = {
  flex: 1,
  minHeight: 0,
  position: 'relative' as const,
};

const LOADING_STYLE = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  height: '100%',
  fontSize: 12,
  color: 'var(--ds-text-muted)',
};

export function HostedMarketsGrid<
  TData extends Record<string, unknown> = Record<string, unknown>,
>(props: HostedMarketsGridProps<TData>): ReactNode {
  const {
    componentName,
    defaultInstanceId,
    defaultAppId,
    defaultUserId,
    documentTitle,
    withStorage = false,
    configManager,
    theme = 'auto',
    dataServices,
    platform,
    dataServicesMode = 'lazy',
    caption,
    contextLink,
    ...containerProps
  } = props;

  // Imperative handle to the underlying MarketsGrid — captured via
  // `onReady` because MarketsGridContainer is a plain function
  // component, not a forwardRef. The workspace-save callback reads it
  // through the ref so the same `saveActiveProfile` code path the
  // toolbar Save button calls runs on `Save Workspace`.
  const gridRef = useRef<MarketsGridHandle | null>(null);

  // Grid API as state (not just the ref) so the context-link hook
  // re-runs its effects once the live grid is ready / re-mounts on a
  // provider switch. Only tracked when context linking is enabled.
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const linkActive = contextLink?.enabled === true;

  // Resolved row-key field(s) from the active provider (drives getRowId).
  // The container reports it via onRowIdFieldChange; we feed it into the link
  // config so broadcasts carry the real key columns + values — no hardcoding.
  const [linkRowIdField, setLinkRowIdField] = useState<string | readonly string[] | null>(null);
  const effectiveContextLink = useMemo<GridContextLinkConfig | undefined>(() => {
    if (!contextLink) return contextLink;
    const resolved = linkRowIdField ?? contextLink.rowIdField ?? undefined;
    return resolved !== undefined ? { ...contextLink, rowIdField: resolved } : contextLink;
  }, [contextLink, linkRowIdField]);

  // Chain any caller-supplied onReady so we don't shadow it.
  const callerOnReady = (containerProps as { onReady?: (h: MarketsGridHandle) => void }).onReady;
  const handleReady = useCallback(
    (handle: MarketsGridHandle) => {
      gridRef.current = handle;
      if (linkActive) setGridApi(handle.gridApi as unknown as GridApi);
      callerOnReady?.(handle);
    },
    [callerOnReady, linkActive],
  );

  const onWorkspaceSave = useCallback(async () => {
    const handle = gridRef.current;
    // Prefer `saveAll` — same path as the toolbar Save button, so the
    // container's busy overlay and grid-state capture both run. Fall
    // back to `profiles.saveActiveProfile` for older handle shapes.
    if (handle?.saveAll) {
      await handle.saveAll();
      return;
    }
    if (handle?.profiles?.saveActiveProfile) {
      await handle.profiles.saveActiveProfile();
    }
  }, []);

  const { identity, ready, agTheme, tabsHidden, linking } = useHostedView({
    defaultInstanceId,
    defaultAppId,
    defaultUserId,
    withStorage,
    configManager,
    componentName,
    theme,
    onWorkspaceSave,
  });

  // Flush grid state on view teardown — workspace drag/move does not fire
  // `workspace-saving`, so persist on unmount, page hide, and OpenFin destroy.
  useEffect(() => {
    const flush = () => {
      void onWorkspaceSave();
    };

    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);

    let view: {
      on?: (event: string, cb: () => void) => void;
      removeListener?: (event: string, cb: () => void) => void;
    } | null = null;
    try {
      if (typeof fin !== 'undefined' && typeof fin.View?.getCurrentSync === 'function') {
        view = fin.View.getCurrentSync();
        view?.on?.('destroyed', flush);
      }
    } catch {
      /* not running inside an OpenFin view */
    }

    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      flush();
      try {
        view?.removeListener?.('destroyed', flush);
      } catch {
        /* view already torn down */
      }
    };
  }, [onWorkspaceSave]);

  // Two-way binding between the toolbar caption and the OpenFin view's
  // tab name. `tabTitle` seeds from `customData.savedTitle` (the value
  // "Save Tab As…" writes) and tracks external renames; `writeTabTitle`
  // pushes a toolbar edit back onto the tab. Outside OpenFin this is a
  // plain local value with a no-op writer.
  const { title: tabTitle, setTitle: writeTabTitle } = useViewTabTitle(caption ?? componentName);

  // A caption edit in the toolbar seeds the tab name; chain any
  // consumer-supplied handler so we don't shadow it.
  const consumerOnCaptionChange = (containerProps as {
    onCaptionChange?: (next: string) => void;
  }).onCaptionChange;
  const handleCaptionChange = useCallback(
    (next: string) => {
      writeTabTitle(next);
      consumerOnCaptionChange?.(next);
    },
    [writeTabTitle, consumerOnCaptionChange],
  );

  // Notification Center messages for link traffic — a "sent" notification on
  // local selection broadcast and an acknowledgement on receiving a peer's.
  // Inert unless `contextLink.notify` is set (and only fires in an OpenFin host).
  const linkNotifications = useGridLinkNotifications({
    instanceId: identity.instanceId ?? defaultInstanceId,
    enabled: linkActive && contextLink?.notify === true,
  });

  // Transport for grid-to-grid context linking. The workspace dock "Link"
  // button joins windows to OpenFin INTEROP context groups, which
  // `window.fdc3`'s channel tracking doesn't reliably reflect (a linked view
  // can report "no channel" and drop every broadcast). So prefer the interop
  // client when present; fall back to the FDC3 facade only outside OpenFin.
  const interopChannel = useInteropChannel({ debug: contextLink?.debug === true });
  const linkTransport = isInteropAvailable() ? interopChannel : linking.fdc3;

  // Grid-to-grid context linking over OpenFin's colored "Link" groups.
  // No-op unless `contextLink.enabled` is true; degrades cleanly outside
  // an OpenFin runtime.
  useGridContextLink({
    gridApi,
    fdc3: linkTransport,
    instanceId: identity.instanceId ?? defaultInstanceId,
    config: effectiveContextLink,
    onPublish: linkNotifications.onPublish,
    onReceive: linkNotifications.onReceive,
  });

  // Document title — restored on unmount.
  useEffect(() => {
    const prev = document.title;
    document.title = documentTitle ?? componentName;
    return () => {
      document.title = prev;
    };
  }, [componentName, documentTitle]);

  // One-shot legacy `marketsgrid-view-state::*` cleanup. Sentinel-gated
  // so it only runs once per browser regardless of how many hosted
  // grids mount.
  useEffect(() => {
    if (!identity.configManager || !identity.instanceId) return;
    try {
      if (window.localStorage.getItem(LEGACY_CLEANUP_SENTINEL) === '1') return;
    } catch {
      // localStorage unavailable (private mode, SSR) — best-effort skip.
      return;
    }
    void identity.configManager
      .deleteConfig(`marketsgrid-view-state::${identity.instanceId}`)
      .catch(() => {
        /* no row to clean — fine */
      })
      .finally(() => {
        try {
          window.localStorage.setItem(LEGACY_CLEANUP_SENTINEL, '1');
        } catch {
          /* ignore */
        }
      });
  }, [identity.configManager, identity.instanceId]);

  const containerNode = useMemo(() => {
    if (!ready || !identity.configManager || !identity.instanceId) {
      return <div style={LOADING_STYLE}>Connecting to ConfigService…</div>;
    }
    if (withStorage && !identity.storage) {
      return <div style={LOADING_STYLE}>Connecting to ConfigService…</div>;
    }
    // Caption is always shown (no longer gated on `tabsHidden`) and is
    // driven by the OpenFin tab name so the two stay in lockstep.
    const headerCaption = tabTitle || caption || componentName;
    return (
      <MarketsGridContainer<TData>
        {...(containerProps as MarketsGridContainerProps<TData>)}
        caption={headerCaption}
        tabsHidden={tabsHidden}
        onCaptionChange={handleCaptionChange}
        instanceId={identity.instanceId}
        appId={identity.appId}
        userId={identity.userId}
        componentName={componentName}
        storage={identity.storage ?? undefined}
        theme={agTheme}
        onReady={handleReady}
        onRowIdFieldChange={linkActive ? setLinkRowIdField : undefined}
      />
    );
    // containerProps changes per render; spread is shallow so we depend
    // on the underlying primitives indirectly via React's normal flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    identity.configManager,
    identity.instanceId,
    identity.appId,
    identity.userId,
    identity.storage,
    withStorage,
    componentName,
    agTheme,
    containerProps,
    caption,
    tabTitle,
    handleCaptionChange,
    tabsHidden,
    handleReady,
    linkActive,
  ]);

  const dataServicesWrapped = identity.configManager
    ? platform
      ? (
        <DataHubProvider platform={platform} mode={dataServicesMode} userId={identity.userId}>
          {containerNode}
        </DataHubProvider>
      )
      : dataServices
        ? (
          <DataServicesProvider services={dataServices} mode={dataServicesMode} userId={identity.userId}>
            {containerNode}
          </DataServicesProvider>
        )
        : containerNode
    : containerNode;

  return (
    <>
      {fullBleedReset()}
      <div style={FULL_BLEED_STYLE}>
        <div style={INNER_FILL_STYLE}>{dataServicesWrapped}</div>
      </div>
    </>
  );
}
