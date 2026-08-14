/**
 * StarGrid — the one grid component.
 *
 * The consumer names the grid and (optionally) a data provider; StarGrid
 * does the rest:
 *
 *  - **Mode is inferred, never chosen.** A provider whose type is SSRM
 *    (`isSsrmProviderType`) renders the server-side row model path; any other
 *    provider renders the client-side path; no provider + `rowData`
 *    renders a static grid; neither renders the client-side container
 *    alone — the customizer's DATA PROVIDER card picks the provider at
 *    runtime. The consumer never picks a container.
 *  - **Identity comes from context.** `appId` / `userId` / the storage
 *    factory are read from `createStarui()`'s provider (or a
 *    `StaruiIdentityProvider` in apps with their own bootstrap) — no
 *    per-grid identity props, no fallback chains.
 *  - **Hosting is built in.** The document title, the workspace-save /
 *    view-teardown state flush, OpenFin colour linking (`contextLink`),
 *    and the `[data-theme]`-reactive AG Grid theme — previously the
 *    hosted wrappers' job — are part of the component.
 *
 * ```tsx
 * <starui.Provider>
 *   <StarGrid gridId="blotter" providerId="dp-positions" />
 * </starui.Provider>
 * ```
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { ColDef, GridApi } from 'ag-grid-community';
import { isSsrmProviderType } from '@wellsfargo-starui/types';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import {
  useDataProviderConfig,
  useStaruiIdentity,
} from '@wellsfargo-starui/react/data/runtime';
import { MarketsGrid, type MarketsGridHandle, type MarketsGridProps } from '@wellsfargo-starui/grid';
import { MarketsGridContainer } from '../container/markets-grid-container/MarketsGridContainer.js';
import { SsrmMarketsGridContainer } from '../container/ssrm-markets-grid-container/SsrmMarketsGridContainer.js';
import { useAgGridTheme } from '../hosted/useAgGridTheme.js';
import { useTabsHidden } from '../hosted/useTabsHidden.js';
import { useViewTabTitle } from '../hosted/useViewTabTitle.js';
import { useWorkspaceSaveEvent } from '../hosted/useWorkspaceSaveEvent.js';
import { useFdc3Channel } from '../hosted/useFdc3Channel.js';
import { useInteropChannel, isInteropAvailable } from '../hosted/useInteropChannel.js';
import {
  useGridContextLink,
  type GridContextLinkConfig,
} from '../hosted/useGridContextLink.js';
import { useGridLinkNotifications } from '../hosted/useGridLinkNotifications.js';
import { createRowIdSetFilterResolver } from '../hosted/gridContextLink.js';
import { createSsrmSelectionContextBuilder } from '../hosted/ssrmGridContextLink.js';

import { getCurrentView, isOpenFin } from '@wellsfargo-starui/openfin/host';

/** Fills the parent; `fullBleed` pins to the viewport (hosted-view style). */
const FULL_BLEED_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--ds-surface-ground)',
  color: 'var(--ds-text-primary)',
  overflow: 'hidden',
};

const FILL_STYLE: CSSProperties = {
  height: '100%',
  width: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
};

export interface StarGridProps {
  /** Unique grid id — keys saved profiles and grid-level state. */
  gridId: string;
  /**
   * Catalog data-provider id. CSRM vs SSRM is inferred via
   * `isSsrmProviderType(providerType)`. Omit for a static grid (`rowData`) or a
   * customizer-driven grid (neither — the provider is picked at runtime).
   */
  providerId?: string;
  /** Static rows — used only when no `providerId` is given. */
  rowData?: readonly unknown[];
  /** Column definitions for the static path (providers carry their own). */
  columnDefs?: ColDef[];
  /** Toolbar caption. */
  title?: string;
  /** Pin the grid to the full viewport (single-grid views). Default false. */
  fullBleed?: boolean;
  /** Document (browser tab) title while mounted; restored on unmount. */
  documentTitle?: string;
  /**
   * OpenFin colour-based grid linking — dock-link two grids to the same
   * colour to share row selection. `{ enabled, mode }` is the whole
   * consumer surface; expert overrides live under `advanced`
   * ({@link GridContextLinkAdvanced}). Mode-aware defaults are injected:
   * SSRM gets worker-resolved group / select-all publishes (and
   * `mode: 'rowId'` receives as a key-column set-filter); CSRM fills
   * `advanced.rowIdField` from the container's resolved key column.
   */
  contextLink?: GridContextLinkConfig;
  /** Imperative handle once the grid is live. */
  onReady?: (handle: MarketsGridHandle) => void;
  /** Rendered while the provider row is being resolved. */
  fallback?: ReactNode;
  /**
   * Typed escape hatch — everything else the underlying MarketsGrid
   * surface accepts (toolbars, theme, admin actions, …).
   * Prefer the first-class props; reach in here for the rest.
   */
  advanced?: Partial<Omit<MarketsGridProps, 'gridId' | 'rowData' | 'columnDefs'>>;
}

export function StarGrid(props: StarGridProps): ReactElement {
  const {
    gridId,
    providerId,
    rowData,
    columnDefs,
    title,
    fullBleed = false,
    documentTitle,
    contextLink,
    onReady,
    fallback = null,
    advanced,
  } = props;

  const identity = useStaruiIdentity();
  if (!identity) {
    throw new Error(
      '<StarGrid> must be mounted inside <starui.Provider> (see createStarui()).',
    );
  }

  const frame = fullBleed ? FULL_BLEED_STYLE : FILL_STYLE;

  // Provider row — only fetched when a provider is named. Mode inference
  // reads the row's providerType; the row also exists before the
  // transport connects, so this resolves fast and once.
  const { cfg: providerRow, loading } = useDataProviderConfig(providerId ?? null);

  // ── Document title (set on mount, restored on unmount) ─────────────
  useEffect(() => {
    if (!documentTitle) return;
    const prev = document.title;
    document.title = documentTitle;
    return () => {
      document.title = prev;
    };
  }, [documentTitle]);

  // ── Theme — reactive to the host's `[data-theme]` unless the caller
  // pins one through `advanced.theme`.
  const autoTheme = useAgGridTheme('auto');
  const theme = advanced?.theme ?? autoTheme;

  // ── Save flush — workspace save + view teardown ────────────────────
  //
  // `Save Workspace` runs the same `saveAll` path as the toolbar Save
  // button; workspace drag/move does not fire `workspace-saving`, so the
  // grid also flushes on unmount, page hide, and OpenFin view destroy.
  const gridRef = useRef<MarketsGridHandle | null>(null);
  const flushGridState = useCallback(async () => {
    const handle = gridRef.current;
    if (handle?.saveAll) {
      await handle.saveAll();
      return;
    }
    if (handle?.profiles?.saveActiveProfile) {
      await handle.profiles.saveActiveProfile();
    }
  }, []);
  useWorkspaceSaveEvent(flushGridState);
  useEffect(() => {
    const flush = () => {
      void flushGridState();
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    const view = getCurrentView();
    try {
      view?.on?.('destroyed', flush);
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
  }, [flushGridState]);

  // Mode inference — needed by the link wiring below as well as the body.
  const isSsrm = providerRow != null && isSsrmProviderType(String(providerRow.providerType));

  // ── Colour-link wiring (mirrors the hosted wrappers; SSRM injects the
  // worker-backed selection builder, CSRM only resolves rowIdField) ────
  const linkActive = contextLink?.enabled === true;
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const advancedOnReady = (advanced as {
    onReady?: (handle: MarketsGridHandle) => void;
  } | undefined)?.onReady;
  const handleReady = useCallback(
    (handle: MarketsGridHandle) => {
      gridRef.current = handle;
      if (linkActive) setGridApi(handle.gridApi);
      advancedOnReady?.(handle);
      onReady?.(handle);
    },
    [onReady, advancedOnReady, linkActive],
  );

  // Resolved key column(s) (drives getRowId) → link rowIdField + resolver.
  const [linkRowIdField, setLinkRowIdField] = useState<string | readonly string[] | null>(null);
  const advancedOnRowIdFieldChange = (advanced as {
    onRowIdFieldChange?: (field: string | readonly string[] | null) => void;
  } | undefined)?.onRowIdFieldChange;
  const handleRowIdFieldChange = useCallback(
    (field: string | readonly string[] | null) => {
      setLinkRowIdField(field);
      advancedOnRowIdFieldChange?.(field);
    },
    [advancedOnRowIdFieldChange],
  );

  // Live provider for worker-resolved group / select-all publishes. A ref
  // is enough: the builder reads it lazily at publish time.
  const providerRef = useRef<ISsrmDataProvider | null>(null);
  const advancedOnProviderReady = (advanced as {
    onProviderReady?: (provider: ISsrmDataProvider) => void;
  } | undefined)?.onProviderReady;
  const handleProviderReady = useCallback(
    (provider: ISsrmDataProvider) => {
      providerRef.current = provider;
      advancedOnProviderReady?.(provider);
    },
    [advancedOnProviderReady],
  );

  const effectiveContextLink = useMemo<GridContextLinkConfig | undefined>(() => {
    if (!contextLink) return undefined;
    const adv = contextLink.advanced;
    if (!isSsrm) {
      // CSRM (HostedMarketsGrid parity): only fill rowIdField from the
      // container's resolved key column(s); the generic selection
      // builder / resolver defaults inside useGridContextLink apply.
      const resolved = linkRowIdField ?? adv?.rowIdField ?? undefined;
      return resolved !== undefined
        ? { ...contextLink, advanced: { ...adv, rowIdField: resolved } }
        : contextLink;
    }
    const keyColumn = typeof linkRowIdField === 'string' ? linkRowIdField : 'id';
    const buildContext =
      adv?.buildContext
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
      adv?.resolve
      ?? (contextLink.mode === 'rowId'
        ? createRowIdSetFilterResolver(keyColumn)
        : undefined);
    return {
      ...contextLink,
      advanced: {
        ...adv,
        rowIdField: adv?.rowIdField ?? keyColumn,
        buildContext,
        ...(resolve ? { resolve } : {}),
      },
    };
  }, [contextLink, linkRowIdField, isSsrm]);

  // Link identity prefers the per-view instance id (advanced.instanceId)
  // so two restored views of the same grid don't filter each other's
  // publishes as their own.
  const linkInstanceId = (advanced as { instanceId?: string } | undefined)?.instanceId ?? gridId;
  const linkNotifications = useGridLinkNotifications({
    instanceId: linkInstanceId,
    enabled: linkActive && contextLink?.advanced?.notify === true,
  });

  // Prefer the interop client under OpenFin (the dock "Link" button joins
  // interop context groups that window.fdc3 doesn't reliably reflect).
  const fdc3 = useFdc3Channel();
  const interopChannel = useInteropChannel({ debug: contextLink?.advanced?.debug === true });
  const linkTransport = isInteropAvailable() ? interopChannel : fdc3;

  // Loud init validation: linking that can never carry traffic is a
  // config/manifest bug, not a quiet degradation. Interop is present by
  // default in platform views (no manifest flag); the FDC3 fallback needs
  // `fdc3InteropApi` in defaultViewOptions/defaultWindowOptions.
  useEffect(() => {
    if (!linkActive || !isOpenFin()) return;
    if (!isInteropAvailable() && typeof (window as { fdc3?: unknown }).fdc3 === 'undefined') {
      console.error(
        `[StarGrid] contextLink is enabled for "${gridId}" but neither the OpenFin interop API ` +
          '(fin.me.interop) nor window.fdc3 is available — grid linking cannot carry any traffic. ' +
          'Platform views get interop by default; if this view was created outside the platform, ' +
          'set `fdc3InteropApi` in the manifest defaultViewOptions/defaultWindowOptions to enable ' +
          'the FDC3 fallback.',
      );
    }
  }, [linkActive, gridId]);

  useGridContextLink({
    gridApi,
    transport: linkTransport,
    instanceId: linkInstanceId,
    config: effectiveContextLink,
    onPublish: linkNotifications.onPublish,
    onReceive: linkNotifications.onReceive,
  });

  // ── CSRM caption ↔ OpenFin tab name (HostedMarketsGrid parity) ─────
  //
  // `tabTitle` seeds from `customData.savedTitle` ("Save Tab As…") and
  // tracks external renames; a toolbar caption edit writes back to the
  // tab. Outside OpenFin this is a plain local value with a no-op
  // writer. The SSRM container carries its own `title` prop and the SSRM
  // wrapper never bound tab titles, so this stays CSRM-only.
  const { title: tabTitle, setTitle: writeTabTitle } = useViewTabTitle(title ?? gridId);
  const tabsHidden = useTabsHidden();
  const advancedOnCaptionChange = (advanced as {
    onCaptionChange?: (next: string) => void;
  } | undefined)?.onCaptionChange;
  const handleCaptionChange = useCallback(
    (next: string) => {
      writeTabTitle(next);
      advancedOnCaptionChange?.(next);
    },
    [writeTabTitle, advancedOnCaptionChange],
  );

  const body = useMemo<ReactElement>(() => {
    if (!providerId && rowData) {
      return (
        <MarketsGrid
          gridId={gridId}
          columnDefs={(columnDefs ?? []) as never}
          rowData={rowData as never}
          caption={title}
          appId={identity.appId}
          userId={identity.userId}
          storage={identity.storage}
          theme={theme}
          {...(advanced as object)}
          onReady={handleReady as never}
        />
      );
    }

    if (providerId && !providerRow) {
      // Row still loading (or missing). Loading renders the fallback;
      // a missing row renders a plain message rather than throwing —
      // catalogs hydrate asynchronously on cold starts.
      return (
        <div style={{ padding: 16, opacity: 0.7, fontSize: 12 }}>
          {loading ? fallback : `Data provider "${providerId}" was not found in the catalog.`}
        </div>
      );
    }

    if (isSsrm && providerId) {
      return (
        <SsrmMarketsGridContainer
          providerId={providerId}
          gridId={gridId}
          title={title}
          appId={identity.appId}
          userId={identity.userId}
          storage={identity.storage}
          theme={theme}
          {...(advanced as object)}
          onReady={handleReady}
          onRowIdFieldChange={handleRowIdFieldChange}
          onProviderReady={handleProviderReady}
        />
      );
    }

    // CSRM — either a named default provider, or (no providerId, no
    // rowData) the container alone: the customizer's DATA PROVIDER card
    // picks the provider at runtime, persisted per gridId.
    return (
      <MarketsGridContainer
        gridId={gridId}
        defaultLiveProviderId={providerId}
        caption={tabTitle || title || gridId}
        tabsHidden={tabsHidden}
        appId={identity.appId}
        userId={identity.userId}
        storage={identity.storage}
        theme={theme}
        {...(advanced as object)}
        onCaptionChange={handleCaptionChange}
        onReady={handleReady}
        onRowIdFieldChange={linkActive ? handleRowIdFieldChange : undefined}
      />
    );
  }, [
    providerId, providerRow, loading, isSsrm, gridId, columnDefs, rowData, title,
    identity, theme, handleReady, handleRowIdFieldChange, handleProviderReady,
    tabTitle, tabsHidden, handleCaptionChange, linkActive,
    fallback, advanced,
  ]);

  // Full-bleed views own the page: kill host margins/scrollbars so the
  // grid has a definite height in OpenFin views (parity with the hosted
  // wrappers' frame — without it the AG Grid viewport can collapse).
  const fullBleedReset = fullBleed ? (
    <style>{`
      html, body {
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
      }
    `}</style>
  ) : null;

  return (
    <>
      {fullBleedReset}
      <div style={frame}>{body}</div>
    </>
  );
}
