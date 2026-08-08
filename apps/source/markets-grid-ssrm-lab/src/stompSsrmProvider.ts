/**
 * STOMP SSRM catalog seed for MarketsGrid SSRM Lab.
 * Same wire as stomp-marketsgrid-minimal SSRM path; app-namespaced provider id.
 */

import type { DataProviderConfig, StompSsrmProviderConfig } from '@wellsfargo-starui/types';

const TAG = 'TRADER001';

/** Bump when wire destinations / columns change so App re-persists the catalog row. */
export const STOMP_SSRM_CFG_VERSION = 1;

export const STOMP_SSRM_PROVIDER_ID = 'markets-grid-ssrm-lab:positions-ssrm';

const stompSsrm: StompSsrmProviderConfig = {
  providerType: 'stomp-ssrm',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: `/snapshot/positions/${TAG}`,
  requestMessage: `/snapshot/positions/${TAG}/1000/50`,
  requestBody: '',
  snapshotEndToken: 'Success',
  snapshotTimeoutMs: 60_000,
  dataType: 'positions',
  keyColumn: 'positionId',
  autoStart: false,
  snapshotChunkSize: 1000,
  throttleMs: 100,
  conflateByKey: 'positionId',
  blockSize: 100,
  columnDefinitions: [
    { field: 'positionId', headerName: 'Position Id', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'cusip', headerName: 'Cusip', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'ticker', headerName: 'Ticker', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'instrumentName', headerName: 'Instrument Name', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'instrumentType', headerName: 'Instrument Type', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'bookName', headerName: 'Book Name', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'portfolio', headerName: 'Portfolio', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'trader', headerName: 'Trader', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'desk', headerName: 'Desk', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'region', headerName: 'Region', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'country', headerName: 'Country', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'notionalAmount', headerName: 'Notional Amount', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'marketValue', headerName: 'Market Value', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'currentPrice', headerName: 'Current Price', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'pnl', headerName: 'Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'unrealizedPnl', headerName: 'Unrealized Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'realizedPnl', headerName: 'Realized Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'dailyPnl', headerName: 'Daily Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'mtdPnl', headerName: 'Mtd Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'ytdPnl', headerName: 'Ytd Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'yield', headerName: 'Yield', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'spread', headerName: 'Spread', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'dv01', headerName: 'Dv01', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'pv01', headerName: 'Pv01', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'cs01', headerName: 'Cs01', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'rating.moody', headerName: 'Moody', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'rating.sp', headerName: 'Sp', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'rating.fitch', headerName: 'Fitch', cellDataType: 'text', filter: true, sortable: true, resizable: true },
  ],
};

export const stompSsrmProviderDraft: DataProviderConfig = {
  providerId: STOMP_SSRM_PROVIDER_ID,
  name: 'SSRM Positions',
  providerType: 'stomp-ssrm',
  userId: 'dev1',
  public: false,
  config: stompSsrm,
};

export const SSRM_CFG_VERSION_KEY = 'markets-grid-ssrm-lab.stomp-ssrm-cfg-version';
