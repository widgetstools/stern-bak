/**
 * SSRM counterpart to {@link useProviderDataWiring}.
 *
 * The CSRM hook owns rows: it pushes snapshots into `rowData` and splits
 * ticks into AG Grid transactions. Under SSRM the rows never reach the main
 * thread — `MarketsGridSsrmSurface` reads blocks straight from the worker —
 * so all that is left is the chrome the container renders from provider
 * state: the stale-data banner, the snapshot loading overlay and its
 * progressive row count, and the `provider:status` container event.
 *
 * Keeping this out of the container also keeps the two row models from
 * sharing one branchy effect; each hook subscribes to the provider shape it
 * actually has.
 */
import { useEffect, useRef } from 'react';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { ProviderMode } from './gridLevelState.js';
import type { createMarketsGridContainerEventBus } from '@wellsfargo-starui/grid';

type ContainerEventBus = ReturnType<typeof createMarketsGridContainerEventBus>;

export interface UseSsrmProviderWiringParams {
  provider: ISsrmDataProvider | null;
  activeId: string | null;
  subscriptionKey: string | null;
  mode: ProviderMode;
  onError?: (error: Error) => void;
  containerEventBus: ContainerEventBus;
  setLoadRowCount: (count: number | undefined) => void;
  setProviderDisconnected: (disconnected: boolean) => void;
  setDisconnectDetail: (detail: string | undefined) => void;
  setResolvedSubKey: (key: string | null) => void;
  setIsRefetching: (refetching: boolean) => void;
}

function defaultOnError(err: Error): void {
  // eslint-disable-next-line no-console
  console.error('[MarketsGridContainer]', err);
}

export function useSsrmProviderWiring(params: UseSsrmProviderWiringParams): void {
  const {
    provider,
    activeId,
    subscriptionKey,
    mode,
    onError,
    containerEventBus,
    setLoadRowCount,
    setProviderDisconnected,
    setDisconnectDetail,
    setResolvedSubKey,
    setIsRefetching,
  } = params;

  // Read-only inside the effect — mirrors useProviderDataWiring so a mode
  // change doesn't tear the listeners down mid-stream.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!provider || !activeId) return;

    setProviderDisconnected(false);
    setDisconnectDetail(undefined);

    let cancelled = false;
    const thisSubKey = subscriptionKey ?? activeId;

    const unsubRows = provider.onRowsReceived((count) => {
      if (!cancelled) setLoadRowCount(count);
    });

    const unsubStatus = provider.onStatus((status, err) => {
      if (cancelled) return;

      if (err) {
        setProviderDisconnected(true);
        setDisconnectDetail(err);
        setIsRefetching(false);
        (onErrorRef.current ?? defaultOnError)(new Error(err));
      } else if (status === 'loading') {
        setIsRefetching(true);
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
      } else if (status === 'ready') {
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
        setIsRefetching(false);
      }

      // The surface serves blocks from the worker cache, so there is no
      // snapshot commit to wait for — the overlay clears as soon as the
      // provider reports a terminal state.
      if (status !== 'loading') setResolvedSubKey(thisSubKey);

      containerEventBus.emit('provider:status', {
        status,
        error: err,
        providerId: activeId,
        mode: modeRef.current,
      });
    });

    const unsubError = provider.onError((err) => {
      if (cancelled) return;
      setResolvedSubKey(thisSubKey);
      setIsRefetching(false);
      (onErrorRef.current ?? defaultOnError)(err);
    });

    return () => {
      cancelled = true;
      unsubRows();
      unsubStatus();
      unsubError();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, activeId, subscriptionKey, containerEventBus]);
}
