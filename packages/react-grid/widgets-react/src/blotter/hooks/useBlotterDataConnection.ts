import { useEffect, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { IDataProvider } from '@wellsfargo-starui/host-data';
import { useDataProvider } from '@wellsfargo-starui/host-data-react/runtime';
import { createApplyProviderToGridState } from '../../container/markets-grid-container/applyProviderToGrid.js';

export interface UseBlotterDataConnectionOptions {
  gridApi: GridApi | null;
  /** Hub provider id — resolved via {@link useDataProvider} when `provider` is omitted. */
  providerId?: string | null;
  /** Explicit {@link IDataProvider} (DI). Takes precedence over `providerId`. */
  provider?: IDataProvider | null;
  getRowId?: (row: Record<string, unknown>) => string;
}

export interface UseBlotterDataConnectionResult {
  isConnected: boolean;
  rowCount: number;
}


/**
 * useBlotterDataConnection — grid wiring for {@link IDataProvider}.
 *
 * When `provider` is omitted, resolves one via {@link useDataProvider}
 * (requires an ancestor {@link DataServicesProvider} / {@link DataHubProvider}).
 */
export function useBlotterDataConnection({
  gridApi,
  providerId,
  provider: explicitProvider,
  getRowId,
}: UseBlotterDataConnectionOptions): UseBlotterDataConnectionResult {
  const { provider: hubProvider } = useDataProvider(
    explicitProvider ? null : (providerId ?? null),
    // status is unused here — the connection consumes provider events
    // directly; trackStatus:false avoids a host re-render per status
    // transition.
    { autoStart: false, trackStatus: false },
  );
  const provider = explicitProvider ?? hubProvider;

  const [rowCount, setRowCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!gridApi || !provider) {
      setIsConnected(false);
      return;
    }

    if (providerId && provider.id !== providerId) {
      // eslint-disable-next-line no-console
      console.warn(
        `[useBlotterDataConnection] provider.id=${provider.id} does not match providerId=${providerId}`,
      );
    }

    const gridApply = createApplyProviderToGridState();
    let cancelled = false;

    const commitSnapshot = (rows: readonly Record<string, unknown>[]) => {
      gridApply.clearPendingAdds();
      if (getRowId) {
        gridApply.markSnapshotLoadedWithResolver(rows, (row) => {
          const id = getRowId(row);
          return id || null;
        });
      } else {
        gridApply.markSnapshotLoaded(rows, 'id');
      }
      gridApi.setGridOption('rowData', rows.slice());
      setRowCount(rows.length);
    };

    const unsubSnapshot = provider.onSnapshotData((rows) => {
      if (cancelled) return;
      Promise.resolve().then(() => {
        if (cancelled) return;
        try {
          gridApi.flushAsyncTransactions();
        } catch {
          /* grid mid-teardown */
        }
        commitSnapshot(rows as Record<string, unknown>[]);
      });
    });

    const unsubTick = provider.onTick((rows) => {
      if (cancelled || rows.length === 0) return;
      let result;
      if (getRowId) {
        result = gridApply.applyTickWithResolver(gridApi, rows as Record<string, unknown>[], (row) => {
          const id = getRowId(row);
          return id || null;
        });
      } else {
        result = gridApply.applyTick(gridApi, rows as Record<string, unknown>[], 'id');
      }
      // Displayed row count only changes on adds — avoid React setState every tick.
      if (result.addCount > 0) {
        setRowCount(gridApi.getDisplayedRowCount());
      }
    });

    const unsubError = provider.onError((error) => {
      // eslint-disable-next-line no-console
      console.error('[BlotterDataConnection] Error:', error);
    });

    setIsConnected(true);

    void provider.start().catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[BlotterDataConnection] start failed:', error);
    });

    return () => {
      cancelled = true;
      unsubSnapshot();
      unsubTick();
      unsubError();
      setIsConnected(false);
      void provider.stop();
    };
  }, [gridApi, provider, providerId, getRowId]);

  return {
    isConnected,
    rowCount,
  };
}
