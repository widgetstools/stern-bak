/**
 * HostedSsrmMarketsGrid — smoke / hosted entry for SSRM MarketsGrid.
 * Mirrors HostedMarketsGrid identity/storage/theme bootstrap with the SSRM container.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import type {
  ISsrmDataProvider,
  ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/data';
import {
  DataServicesProvider,
  DataHubProvider,
} from '@wellsfargo-starui/react/data/runtime';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid';
import {
  SsrmMarketsGridContainer,
  type SsrmMarketsGridContainerProps,
} from '../container/ssrm-markets-grid-container/index.js';
import { useHostedView } from './useHostedView.js';
import type { AgGridThemeMode } from './useAgGridTheme.js';
import type { ConfigManager } from './types.js';
import { createRowIdSetFilterResolver } from './gridContextLink.js';
import { createSsrmSelectionContextBuilder } from './ssrmGridContextLink.js';
import {
  useGridContextLink,
  type GridContextLinkConfig,
} from './useGridContextLink.js';
import { useGridLinkNotifications } from './useGridLinkNotifications.js';
import { useInteropChannel, isInteropAvailable } from './useInteropChannel.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const fin: any;

type ContainerOwnedKeys =
  | 'instanceId'
  | 'appId'
  | 'userId'
  | 'storage'
  | 'theme';

const LOADING_STYLE = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  height: '100%',
  fontSize: 12,
  color: 'var(--ds-text-muted)',
};

// Mirrors HostedMarketsGrid's full-bleed frame byte for byte.
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

export interface HostedSsrmMarketsGridProps
  extends Omit<SsrmMarketsGridContainerProps, ContainerOwnedKeys | 'providerId'> {
  /** Required `stomp-ssrm` catalog provider id. */
  providerId: string;
  /** Logical component name — used for hosted identity / storage diagnostics. */
  componentName: string;
  /** Default `instanceId` when neither OpenFin customData nor URL param resolves one. */
  defaultInstanceId: string;
  /** Default `appId` when OpenFin customData doesn't supply one. */
  defaultAppId?: string;
  /** Default `userId` when OpenFin customData doesn't supply one. */
  defaultUserId?: string;
  /** When true, resolve ConfigService-backed storage from the host ConfigManager. */
  withStorage?: boolean;
  /** Optional ConfigManager override (tests / non-OpenFin runtimes). */
  configManager?: ConfigManager;
  /** AG-Grid theme mode. Defaults to `'auto'`. */
  theme?: AgGridThemeMode;
  /** Optional pre-bootstrapped data services (tests / host shells). */
  dataServices?: DataServices;
  /** Optional hub bundle when using DataHubProvider path. */
  platform?: ResolvedDataServicesHubBundle;
  /** Hydration mode for the AppData mirror when mounting a data-services provider. */
  dataServicesMode?: 'eager' | 'lazy';
  /**
   * OpenFin colour-based grid linking, identical in behaviour to
   * `HostedMarketsGrid`. SSRM defaults are injected: the publish builder
   * resolves group / select-all selections through the worker, and in
   * `mode: 'rowId'` incoming ids are received as a key-column set-filter
   * (SSRM never invokes `doesExternalFilterPass`). Caller-supplied
   * `buildContext` / `resolve` win over the defaults.
   */
  contextLink?: GridContextLinkConfig;
  /** Document (browser tab) title while mounted; restored on unmount. */
  documentTitle?: string;
  children?: ReactNode;
}

/**
 * Drop-in hosted shell for SSRM MarketsGrid + SharedWorker data hub.
 */
export function HostedSsrmMarketsGrid(props: HostedSsrmMarketsGridProps) {
  const {
    componentName,
    defaultInstanceId,
    defaultAppId,
    defaultUserId,
    withStorage = false,
    configManager,
    theme = 'auto',
    dataServices,
    platform,
    dataServicesMode = 'lazy',
    contextLink,
    documentTitle,
    children,
    ...containerProps
  } = props;

  // Document title — restored on unmount (mirrors HostedMarketsGrid).
  useEffect(() => {
    if (!documentTitle) return;
    const prev = document.title;
    document.title = documentTitle;
    return () => {
      document.title = prev;
    };
  }, [documentTitle]);

  // Imperative handle to the underlying MarketsGrid — captured via
  // `onReady` so `Save Workspace` runs the same `saveAll` path the
  // toolbar Save button uses (mirrors HostedMarketsGrid).
  const gridRef = useRef<MarketsGridHandle | null>(null);

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

  const { identity, ready, agTheme, linking } = useHostedView({
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

  // ── Colour-link wiring (mirrors HostedMarketsGrid) ────────────────
  const linkActive = contextLink?.enabled === true;

  // Grid API as state so the link hook re-runs once the live grid mounts.
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const callerOnReady = (containerProps as {
    onReady?: (handle: MarketsGridHandle) => void;
  }).onReady;
  const handleReady = useCallback(
    (handle: MarketsGridHandle) => {
      gridRef.current = handle;
      if (linkActive) setGridApi(handle.gridApi as unknown as GridApi);
      callerOnReady?.(handle);
    },
    [callerOnReady, linkActive],
  );

  // Resolved key column (drives getRowId) → link rowIdField + resolver.
  const [linkRowIdField, setLinkRowIdField] = useState<string | null>(null);
  // Live provider for worker-resolved group / select-all publishes. A ref is
  // enough: the builder reads it lazily at publish time.
  const providerRef = useRef<ISsrmDataProvider | null>(null);
  const handleProviderReady = useCallback((provider: ISsrmDataProvider) => {
    providerRef.current = provider;
  }, []);

  const effectiveContextLink = useMemo<GridContextLinkConfig | undefined>(() => {
    if (!contextLink) return undefined;
    const keyColumn = linkRowIdField ?? 'id';
    const buildContext =
      contextLink.buildContext
      ?? createSsrmSelectionContextBuilder({
        provider: {
          getSetFilterValues: (req) => {
            const provider = providerRef.current;
            if (!provider) return Promise.resolve([]);
            return provider.getSetFilterValues(req);
          },
        },
        keyColumn,
      });
    const resolve =
      contextLink.resolve
      ?? (contextLink.mode === 'rowId'
        ? createRowIdSetFilterResolver(keyColumn)
        : undefined);
    return {
      ...contextLink,
      rowIdField: contextLink.rowIdField ?? keyColumn,
      buildContext,
      ...(resolve ? { resolve } : {}),
    };
  }, [contextLink, linkRowIdField]);

  const linkNotifications = useGridLinkNotifications({
    instanceId: identity.instanceId ?? defaultInstanceId,
    enabled: linkActive && contextLink?.notify === true,
  });

  // Prefer the interop client under OpenFin (the dock "Link" button joins
  // interop context groups that window.fdc3 doesn't reliably reflect).
  const interopChannel = useInteropChannel({ debug: contextLink?.debug === true });
  const linkTransport = isInteropAvailable() ? interopChannel : linking.fdc3;

  useGridContextLink({
    gridApi,
    fdc3: linkTransport,
    instanceId: identity.instanceId ?? defaultInstanceId,
    config: effectiveContextLink,
    onPublish: linkNotifications.onPublish,
    onReceive: linkNotifications.onReceive,
  });

  const containerNode = useMemo(() => {
    if (!ready || !identity.configManager || !identity.instanceId) {
      return <div style={LOADING_STYLE}>Connecting to ConfigService…</div>;
    }
    if (withStorage && !identity.storage) {
      return <div style={LOADING_STYLE}>Connecting to ConfigService…</div>;
    }
    return (
      <SsrmMarketsGridContainer
        {...containerProps}
        onReady={handleReady}
        onRowIdFieldChange={setLinkRowIdField}
        onProviderReady={handleProviderReady}
        instanceId={identity.instanceId}
        appId={identity.appId}
        userId={identity.userId}
        storage={identity.storage ?? undefined}
        theme={agTheme}
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
    agTheme,
    containerProps,
    handleReady,
    handleProviderReady,
  ]);

  const grid = (
    <div style={{ height: '100%', width: '100%', minHeight: 0 }}>
      {containerNode}
      {children}
    </div>
  );

  const fullBleedReset = (
    <style>{`
      html, body {
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
      }
    `}</style>
  );

  const dataServicesWrapped = identity.configManager
    ? platform
      ? (
        <DataHubProvider platform={platform} mode={dataServicesMode} userId={identity.userId}>
          {grid}
        </DataHubProvider>
      )
      : dataServices
        ? (
          <DataServicesProvider
            services={dataServices}
            mode={dataServicesMode}
            userId={identity.userId}
          >
            {grid}
          </DataServicesProvider>
        )
        : grid
    : grid;

  // Full-bleed frame identical to HostedMarketsGrid: `position: fixed` +
  // `inset: 0` gives the grid a definite height regardless of the host
  // route's layout chain — without it the AG Grid viewport collapses to
  // zero height (chrome renders, rows don't) in OpenFin views.
  return (
    <>
      {fullBleedReset}
      <div style={FULL_BLEED_STYLE}>
        <div style={INNER_FILL_STYLE}>{dataServicesWrapped}</div>
      </div>
    </>
  );
}
