import { useEffect, useRef, useState } from 'react';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { ExpressionRule } from '@wellsfargo-starui/data';

export interface UseSsrmProviderDataWiringParams {
  provider: ISsrmDataProvider | null;
  /** Worker expression rules (from MarketsGrid customizer bridge). */
  expressionRules?: readonly ExpressionRule[];
  onStatus?: (text: string) => void;
  onError?: (error: Error) => void;
  setLoadRowCount?: (count: number | undefined) => void;
  /**
   * Cold-start override, used for a historical restore. The plane's provider
   * slot is shared by every window, so a window restoring into historical
   * mode has to decide between attaching to a running slot and restarting it
   * with an as-of overlay — a decision that needs the hub client and the
   * resolved provider id, both of which the CONTAINER holds. When omitted the
   * hook just calls `provider.start()`.
   *
   * Must be referentially stable: this hook keys its effect on it, and an
   * unstable identity restarts the provider on every render.
   */
  startProvider?: (provider: ISsrmDataProvider) => Promise<void>;
}

export interface UseSsrmProviderDataWiringResult {
  /** True after `provider.start()` resolves (snapshot received / plane seeded). */
  ready: boolean;
}

/** Pending StrictMode-safe delayed stops, keyed by provider instance. */
const delayedStops = new WeakMap<ISsrmDataProvider, ReturnType<typeof setTimeout>>();

/**
 * SSRM data plane — start provider, push expressions, surface status.
 * Never touches `rowData` / `applyTransactionAsync`.
 *
 * StrictMode-safe: cleanup schedules a macrotask `stop()` that the next
 * effect clears, so a remount reuses the in-flight STOMP snapshot.
 */
export function useSsrmProviderDataWiring(
  params: UseSsrmProviderDataWiringParams,
): UseSsrmProviderDataWiringResult {
  const {
    provider,
    expressionRules,
    onStatus,
    onError,
    setLoadRowCount,
    startProvider,
  } = params;

  const [ready, setReady] = useState(false);
  const rulesRef = useRef(expressionRules);
  rulesRef.current = expressionRules;

  useEffect(() => {
    if (!provider) {
      setReady(false);
      return;
    }

    // Cancel a stop scheduled by StrictMode's previous effect cleanup.
    const pendingStop = delayedStops.get(provider);
    if (pendingStop !== undefined) {
      clearTimeout(pendingStop);
      delayedStops.delete(provider);
    }

    let cancelled = false;
    setReady(false);

    const offStatus = provider.onStatus((status: string, error?: string) => {
      if (cancelled) return;
      if (status === 'ready') onStatus?.('Live');
      else if (status === 'loading') onStatus?.('Loading…');
      else if (status === 'error') onStatus?.(error ?? 'Error');
    });
    const offError = provider.onError((err: Error) => {
      if (!cancelled) onError?.(err);
    });
    // Coalesced: the worker streams a large snapshot as hundreds of
    // rows-received batches in quick succession. A setState per batch
    // trips React's nested-update ceiling ("Maximum update depth
    // exceeded"), which can kill the whole root — one update per ~100ms
    // keeps the load counter live without the burst.
    let rowCountTimer: ReturnType<typeof setTimeout> | null = null;
    let latestRowCount: number | undefined;
    const offRows = provider.onRowsReceived((count: number) => {
      if (cancelled) return;
      latestRowCount = count;
      rowCountTimer ??= setTimeout(() => {
        rowCountTimer = null;
        if (!cancelled) setLoadRowCount?.(latestRowCount);
      }, 100);
    });

    void (async () => {
      try {
        onStatus?.('Connecting…');
        await (startProvider ? startProvider(provider) : provider.start());
        if (cancelled) return;
        const rules = rulesRef.current;
        if (rules?.length) await provider.configureExpressions([...rules]);
        if (cancelled) return;
        // Same word the status stream uses — previously this said 'Ready'
        // while the stream said 'Live', and the strip showed whichever
        // landed last.
        onStatus?.('Live');
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setReady(false);
        const error = err instanceof Error ? err : new Error(String(err));
        if (error.message.includes('Subscription cancelled')) return;
        onStatus?.(error.message);
        onError?.(error);
      }
    })();

    return () => {
      cancelled = true;
      setReady(false);
      offStatus();
      offError();
      offRows();
      if (rowCountTimer != null) {
        clearTimeout(rowCountTimer);
        rowCountTimer = null;
      }
      // Macrotask (not microtask): StrictMode re-runs this effect in the
      // same turn and clears the timer before stop() can detach.
      const timer = setTimeout(() => {
        delayedStops.delete(provider);
        void provider.stop();
      }, 0);
      delayedStops.set(provider, timer);
    };
  }, [provider, onStatus, onError, setLoadRowCount, startProvider]);

  useEffect(() => {
    if (!provider || !expressionRules || !ready) return;
    void provider.configureExpressions([...expressionRules]);
  }, [provider, expressionRules, ready]);

  return { ready };
}
