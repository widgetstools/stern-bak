/**
 * The blotter's one `stomp-ssrm` provider — the platform SharedWorker
 * connects to the SPG pricing server's STOMP feed, ingests the SQLite
 * snapshot into the SSRM WASM engine, and serves this app's grid blocks
 * from it. Column types here are the ENGINE's schema: numbers order and
 * range-filter natively, `maturityDate` is a typed date column (the
 * engine parses its epoch at write — sorts and day-range filters compare
 * instants while cells keep the ISO string).
 */
import { useEffect, useState } from 'react';
import type { DataProviderConfig, StompSsrmProviderConfig } from '@wellsfargo-starui/types';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/react/data/runtime';

export const SPG_PROVIDER_ID = 'spg-pricing-blotter:positions';

/** Ambient drift rows/sec the trigger asks the server for (0 = quiet feed). */
const DRIFT_ROWS_PER_SEC = 4;

export function buildSpgProviderConfig(): StompSsrmProviderConfig {
  // Engine schema only — which columns are EDITABLE is the grid's colDefs'
  // business (src/provider/columns.ts), not the provider contract's.
  const num = (field: string, headerName: string) => ({
    field, headerName, cellDataType: 'number' as const, filter: true, sortable: true, resizable: true,
  });
  return {
    providerType: 'stomp-ssrm',
    websocketUrl: 'ws://localhost:8091',
    listenerTopic: '/snapshot/positions/SPGDESK',
    requestMessage: `/snapshot/positions/SPGDESK/${DRIFT_ROWS_PER_SEC}/500`,
    requestBody: '',
    snapshotEndToken: 'Success',
    snapshotTimeoutMs: 60_000,
    dataType: 'positions',
    keyColumn: 'cusip',
    autoStart: false,
    blockSize: 200,
    publishWindowMs: 100,
    columnDefinitions: [
      { field: 'cusip', headerName: 'CUSIP', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      { field: 'dealName', headerName: 'Deal', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      { field: 'assetClass', headerName: 'Asset Class', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      { field: 'tranche', headerName: 'Tranche', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      { field: 'rating', headerName: 'Rating', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      num('coupon', 'Coupon'),
      num('spreadDm', 'Sprd/DM'),
      num('yieldToMaturity', 'YTM'),
      num('walYears', 'WAL'),
      num('factor', 'Factor'),
      num('originalFace', 'Orig Face'),
      num('currentFace', 'Curr Face'),
      num('price', 'Price'),
      num('priorPrice', 'Prior Px'),
      num('priceChangePct', 'Px Chg %'),
      num('marketValue', 'Mkt Value'),
      num('pnl', 'PnL'),
      { field: 'maturityDate', headerName: 'Maturity', cellDataType: 'dateString', filter: 'agDateColumnFilter', sortable: true, resizable: true },
      { field: 'trader', headerName: 'Trader', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      { field: 'desk', headerName: 'Desk', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      { field: 'lastUpdate', headerName: 'Updated', cellDataType: 'text', filter: false, sortable: true, resizable: true },
    ],
  };
}

export const spgProviderDraft: DataProviderConfig = {
  providerId: SPG_PROVIDER_ID,
  name: 'SPG Positions (SQLite via STOMP)',
  providerType: 'stomp-ssrm',
  userId: 'dev1',
  public: false,
  config: buildSpgProviderConfig(),
};

/**
 * Seed the catalog row once, re-saving only on a REAL config change — a
 * byte-equal re-save restarts the provider and re-streams the snapshot.
 */
export function useSpgProviderId(): string | null {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [providerId, setProviderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId, { subtype: 'stomp-ssrm' });
      const existing = rows.find((p) => p.providerId === SPG_PROVIDER_ID);
      const differs = !existing
        || JSON.stringify(existing.config ?? null) !== JSON.stringify(spgProviderDraft.config);
      if (differs) await configStore.save(spgProviderDraft, userId);
      if (!cancelled) setProviderId(SPG_PROVIDER_ID);
    })();
    return () => { cancelled = true; };
  }, [configStore, userId]);

  return providerId;
}
