/**
 * StarGrid — the one grid component.
 *
 * The consumer names the grid and (optionally) a data provider; StarGrid
 * does the rest:
 *
 *  - **Mode is inferred, never chosen.** A provider whose `providerType`
 *    ends in `-ssrm` renders the server-side row model path; any other
 *    provider renders the client-side path; no provider + `rowData`
 *    renders a static grid. The consumer never picks a container.
 *  - **Identity comes from context.** `appId` / `userId` / the storage
 *    factory are read from `createStarui()`'s provider — no per-grid
 *    identity props, no fallback chains.
 *
 * ```tsx
 * <starui.Provider>
 *   <StarGrid gridId="blotter" providerId="dp-positions" />
 * </starui.Provider>
 * ```
 */
import { useMemo, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { ColDef } from 'ag-grid-community';
import {
  useDataProviderConfig,
  useStaruiIdentity,
} from '@wellsfargo-starui/react/data/runtime';
import { MarketsGrid, type MarketsGridHandle, type MarketsGridProps } from '@wellsfargo-starui/grid';
import { MarketsGridContainer } from '../container/markets-grid-container/MarketsGridContainer.js';
import { SsrmMarketsGridContainer } from '../container/ssrm-markets-grid-container/SsrmMarketsGridContainer.js';

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
   * Catalog data-provider id. CSRM vs SSRM is inferred from the
   * provider's `providerType`. Omit for a static grid (`rowData`).
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
  /** Imperative handle once the grid is live. */
  onReady?: (handle: MarketsGridHandle) => void;
  /** Rendered while the provider row is being resolved. */
  fallback?: ReactNode;
  /**
   * Typed escape hatch — everything else the underlying MarketsGrid
   * surface accepts (toolbars, theme, contextLink, admin actions, …).
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

  const body = useMemo<ReactElement>(() => {
    if (!providerId) {
      return (
        <MarketsGrid
          gridId={gridId}
          columnDefs={(columnDefs ?? []) as never}
          rowData={(rowData ?? []) as never}
          caption={title}
          appId={identity.appId}
          userId={identity.userId}
          storage={identity.storage}
          {...(advanced as object)}
        />
      );
    }

    if (!providerRow) {
      // Row still loading (or missing). Loading renders the fallback;
      // a missing row renders a plain message rather than throwing —
      // catalogs hydrate asynchronously on cold starts.
      return (
        <div style={{ padding: 16, opacity: 0.7, fontSize: 12 }}>
          {loading ? fallback : `Data provider "${providerId}" was not found in the catalog.`}
        </div>
      );
    }

    const isSsrm = String(providerRow.providerType).endsWith('-ssrm');
    if (isSsrm) {
      return (
        <SsrmMarketsGridContainer
          providerId={providerId}
          gridId={gridId}
          title={title ?? providerRow.name}
          appId={identity.appId}
          userId={identity.userId}
          storage={identity.storage}
          onReady={onReady}
          {...(advanced as object)}
        />
      );
    }

    return (
      <MarketsGridContainer
        gridId={gridId}
        defaultLiveProviderId={providerId}
        caption={title}
        appId={identity.appId}
        userId={identity.userId}
        storage={identity.storage}
        onReady={onReady}
        {...(advanced as object)}
      />
    );
  }, [
    providerId, providerRow, loading, gridId, columnDefs, rowData, title,
    identity, onReady, fallback, advanced,
  ]);

  return <div style={frame}>{body}</div>;
}
