import type { DataProviderConfig, StompProviderConfig } from '@wellsfargo-starui/types';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';

const CLIENT_TAG = 'TRADER001';

const stompConfig: StompProviderConfig = {
  providerType: 'stomp',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: `/snapshot/positions/${CLIENT_TAG}`,
  requestMessage: `/snapshot/positions/${CLIENT_TAG}/1000/50`,
  requestBody: '',
  snapshotEndToken: 'Success',
  snapshotTimeoutMs: 60_000,
  dataType: 'positions',
  keyColumn: 'positionId',
  autoStart: false,
  columnDefinitions: [
    { field: 'positionId', headerName: 'Position ID' },
    { field: 'cusip', headerName: 'CUSIP' },
    { field: 'instrumentType', headerName: 'Type' },
    { field: 'instrumentName', headerName: 'Instrument' },
    { field: 'marketValue', headerName: 'MV', type: 'numericColumn' },
    { field: 'notional', headerName: 'Notional', type: 'numericColumn' },
    { field: 'price', headerName: 'Price', type: 'numericColumn' },
  ],
};

export const positionsProviderDraft: DataProviderConfig = {
  name: 'STOMP Positions (local)',
  description: 'Positions snapshot + live deltas from stomp-view-server',
  providerType: 'stomp',
  userId: LOGGED_IN_USER_ID,
  public: false,
  config: stompConfig,
};
