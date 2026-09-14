import type { DataProviderConfig, StompSsrmProviderConfig } from '@wellsfargo-starui/types';

const TAG = 'TRADER001';

export const STOMP_SSRM_PROVIDER_ID = 'stomp-ssrm-minimal:positions';

/** Default aggregate row-updates per second the fixture broker is asked for. */
export const DEFAULT_LIVE_RATE = 1000;

/**
 * Live update rate for measurement runs — `?rate=10000` on the demo URL.
 * The broker honours the trigger rate exactly (see stomp-view-server), so
 * this is the one knob a load test needs. Clamped to the broker's ceiling.
 */
export function liveRateFromLocation(search: string = typeof location === 'undefined' ? '' : location.search): number {
  const raw = new URLSearchParams(search).get('rate');
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_LIVE_RATE;
  return Math.min(60_000, Math.floor(n));
}

export function buildStompSsrmConfig(rate: number = liveRateFromLocation()): StompSsrmProviderConfig {
  return {
    providerType: 'stomp-ssrm',
    websocketUrl: 'ws://localhost:8081',
    listenerTopic: `/snapshot/positions/${TAG}`,
    requestMessage: `/snapshot/positions/${TAG}/${rate}/50`,
    requestBody: '',
    snapshotEndToken: 'Success',
    snapshotTimeoutMs: 60_000,
    dataType: 'positions',
    keyColumn: 'positionId',
    autoStart: false,
    blockSize: 200,
    publishWindowMs: 100,
    // No `searchColumns`: the quick search then covers every text column, the
    // way AG Grid's own quick filter does under CSRM.
    columnDefinitions: [
      { field: 'positionId', headerName: 'Position Id', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      { field: 'ticker', headerName: 'Ticker', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      { field: 'instrumentName', headerName: 'Instrument Name', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      // Editable text column the feed never ticks — a paste here must survive
      // every later tick and refresh (the numeric hot fields are re-marked by
      // the feed, so an edit there is overwritten by the next upstream tick).
      { field: 'trader', headerName: 'Trader', cellDataType: 'text', filter: true, sortable: true, resizable: true, editable: true },
      { field: 'desk', headerName: 'Desk', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      { field: 'region', headerName: 'Region', cellDataType: 'text', filter: true, sortable: true, resizable: true },
      { field: 'maturityDate', headerName: 'Maturity', cellDataType: 'dateString', filter: 'agDateColumnFilter', sortable: true, resizable: true },
      { field: 'marketValue', headerName: 'Market Value', cellDataType: 'number', filter: true, sortable: true, resizable: true, editable: true },
      { field: 'pnl', headerName: 'Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true, editable: true },
      { field: 'currentPrice', headerName: 'Current Price', cellDataType: 'number', filter: true, sortable: true, resizable: true, editable: true },
    ],
  };
}

export const stompSsrmProviderDraft: DataProviderConfig = {
  providerId: STOMP_SSRM_PROVIDER_ID,
  name: 'STOMP SSRM Positions',
  providerType: 'stomp-ssrm',
  userId: 'dev1',
  public: false,
  config: buildStompSsrmConfig(),
};
