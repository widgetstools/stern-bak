import type { DataProviderConfig, StompSsrmProviderConfig } from '@wellsfargo-starui/types';

const TAG = 'TRADER001';

export const STOMP_SSRM_PROVIDER_CFG_VERSION = 1;
export const STOMP_SSRM_PROVIDER_ID = 'stomp-ssrm-minimal:positions';

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
  blockSize: 200,
  publishWindowMs: 100,
  searchColumns: ['desk', 'trader', 'ticker'],
  columnDefinitions: [
    { field: 'positionId', headerName: 'Position Id', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'ticker', headerName: 'Ticker', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'instrumentName', headerName: 'Instrument Name', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'trader', headerName: 'Trader', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'desk', headerName: 'Desk', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'region', headerName: 'Region', cellDataType: 'text', filter: true, sortable: true, resizable: true },
    { field: 'marketValue', headerName: 'Market Value', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'pnl', headerName: 'Pnl', cellDataType: 'number', filter: true, sortable: true, resizable: true },
    { field: 'currentPrice', headerName: 'Current Price', cellDataType: 'number', filter: true, sortable: true, resizable: true },
  ],
};

export const stompSsrmProviderDraft: DataProviderConfig = {
  providerId: STOMP_SSRM_PROVIDER_ID,
  name: 'STOMP SSRM Positions',
  providerType: 'stomp-ssrm',
  userId: 'dev1',
  public: false,
  config: stompSsrm,
};
