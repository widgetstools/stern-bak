/**
 * Everything {@link SsrmMarketsGridContainer} derives from the provider's RAW
 * status stream: the first-load / refetch flags the loading overlay reads, the
 * stale-banner message, the display text for the optional status strip, the
 * streaming row count, and the container bus's `provider:status` emit.
 *
 * The raw stream is the right source for all of it, and not the wiring hook's
 * `onStatus` — that one receives DISPLAY TEXT ('Live', 'Loading…', an error
 * message), so it cannot tell 'ready' from an error whose message happens to
 * read like a status. `useContainerEventWiring` deliberately leaves
 * `provider:status` to the call site for the same reason: the two containers
 * subscribe to different streams.
 */
import { useEffect, useRef, useState } from 'react';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { MarketsGridContainerEventBus } from '@wellsfargo-starui/grid';
import type { ProviderMode } from '../markets-grid-container/gridLevelState.js';

/**
 * "Values may be stale" is the wrong claim about a feed that never delivered
 * a row, and a user staring at an empty grid needs to be told where to fix it
 * — so the copy is built where both facts are in hand rather than read off a
 * ref at render time.
 */
export function ssrmStaleMessage(detail: string | undefined, everReady: boolean): string {
  if (!everReady) {
    return detail
      ? `Cannot load data from this provider — ${detail}. Pick or repair it in Custom Settings → DATA PROVIDER.`
      : 'Cannot load data from this provider. Pick or repair it in Custom Settings → DATA PROVIDER.';
  }
  return detail
    ? `Live SSRM feed disconnected — ${detail}. Values may be stale.`
    : 'Live SSRM feed disconnected — values may be stale';
}

export interface UseSsrmProviderStatusParams {
  provider: ISsrmDataProvider | null;
  activeProviderId: string | null;
  /** Reported on the `provider:status` payload. Read through a ref so a mode
   *  change never re-subscribes the stream. */
  mode: ProviderMode;
  containerEventBus: MarketsGridContainerEventBus;
}

export interface SsrmProviderStatus {
  /** Display text for the optional status strip. */
  statusText: string;
  /** Pass as the wiring hook's `onStatus` — must stay stable. */
  setStatusText: (text: string) => void;
  loadRowCount: number | undefined;
  /** Pass as the wiring hook's `setLoadRowCount` — must stay stable. */
  setLoadRowCount: (count: number | undefined) => void;
  /**
   * The first load has produced an OUTCOME — ready or error. The loading
   * overlay owns the window before this and the stale banner owns everything
   * after it, because the overlay takes pointer events across the whole grid:
   * leaving it up on a failed provider would take away the only route to
   * repairing that provider.
   */
  firstLoadSettled: boolean;
  /** A re-snapshot AFTER the first load — the overlay returns, "Refreshing". */
  isRefetching: boolean;
  dataStale: boolean;
  /** `undefined` exactly when `dataStale` is false. */
  staleBannerMessage: string | undefined;
}

export function useSsrmProviderStatus(
  params: UseSsrmProviderStatusParams,
): SsrmProviderStatus {
  const { provider, activeProviderId, mode, containerEventBus } = params;

  const [statusText, setStatusText] = useState('Connecting…');
  const [loadRowCount, setLoadRowCount] = useState<number | undefined>();
  const [firstLoadSettled, setFirstLoadSettled] = useState(false);
  const [staleBannerMessage, setStaleBannerMessage] = useState<string | undefined>();
  const [isRefetching, setIsRefetching] = useState(false);

  const firstLoadSettledRef = useRef(false);
  firstLoadSettledRef.current = firstLoadSettled;
  /** True once the provider has reached `ready` at least once — only the
   *  banner's COPY depends on it. */
  const everReadyRef = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (!provider) return;
    everReadyRef.current = false;
    setFirstLoadSettled(false);
    setStaleBannerMessage(undefined);
    setIsRefetching(false);
    // Optional-chained like bindSsrmTicks — bare ISsrmDataProvider mocks
    // (and any transport without status) simply skip staleness.
    const offStatus = provider.onStatus?.((status, statusError) => {
      if (status === 'ready') {
        everReadyRef.current = true;
        setFirstLoadSettled(true);
        setStaleBannerMessage(undefined);
        setIsRefetching(false);
      } else if (status === 'error') {
        setFirstLoadSettled(true);
        setStaleBannerMessage(ssrmStaleMessage(statusError, everReadyRef.current));
        setIsRefetching(false);
      } else if (status === 'loading') {
        setStaleBannerMessage(undefined);
        // During the FIRST load the overlay is already up and this changes
        // nothing; afterwards it is a refetch and gets "Refreshing" copy.
        if (firstLoadSettledRef.current) setIsRefetching(true);
      }
      containerEventBus.emit('provider:status', {
        status,
        error: statusError,
        providerId: activeProviderId,
        mode: modeRef.current,
      });
    });
    return () => offStatus?.();
  }, [provider, activeProviderId, containerEventBus]);

  return {
    statusText,
    setStatusText,
    loadRowCount,
    setLoadRowCount,
    firstLoadSettled,
    isRefetching,
    dataStale: staleBannerMessage != null,
    staleBannerMessage,
  };
}
