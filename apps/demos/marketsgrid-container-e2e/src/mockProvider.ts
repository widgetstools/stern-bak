/**
 * Deterministic mock provider catalog rows — seeded into the ConfigManager
 * by App.tsx, then resolved by the SharedWorker hub on attach.
 *
 * Two providers are seeded so the Custom Settings provider picker has more
 * than one option to switch between — that switch is exactly the
 * save-and-switch path under test (changing the live provider remounts the
 * grid; the container must flush pending customizer edits first).
 *
 * `enableUpdates: false` → the mock fires a fixed snapshot and then goes
 * quiet (no ticking), so grid content is stable across an e2e run. The
 * `positions` generator draws from a fixed 53-issuer universe keyed by
 * `cusip`, so row identity is deterministic too.
 */

import type { ColDef } from 'ag-grid-community';
import type { DataProviderConfig, MockProviderConfig } from '@wellsfargo-starui/types';

/** Stable, app-namespaced ids so configStore.save() upserts (idempotent
 *  under StrictMode's double-invoked seed effect). */
export const MOCK_PROVIDER_A_ID = 'marketsgrid-container-e2e:positions-a';
export const MOCK_PROVIDER_B_ID = 'marketsgrid-container-e2e:positions-b';

/** Bump to force App.tsx to re-persist the catalog rows on next load. */
export const MOCK_PROVIDER_CFG_VERSION = 1;

/** Columns bound to fields the `positions` mock actually emits
 *  (see host-data mockPosition.ts). */
const COLUMNS: ColDef[] = [
  { field: 'cusip', headerName: 'Cusip', cellDataType: 'text', filter: true, sortable: true, resizable: true },
  { field: 'ticker', headerName: 'Ticker', cellDataType: 'text', filter: true, sortable: true, resizable: true },
  { field: 'issuerName', headerName: 'Issuer', cellDataType: 'text', filter: true, sortable: true, resizable: true },
  { field: 'issuerSector', headerName: 'Sector', cellDataType: 'text', filter: true, sortable: true, resizable: true },
  { field: 'securityType', headerName: 'Security Type', cellDataType: 'text', filter: true, sortable: true, resizable: true },
  { field: 'currency', headerName: 'Ccy', cellDataType: 'text', filter: true, sortable: true, resizable: true },
  { field: 'maturityDate', headerName: 'Maturity', cellDataType: 'text', filter: true, sortable: true, resizable: true },
  { field: 'bidPrice', headerName: 'Bid', cellDataType: 'number', filter: true, sortable: true, resizable: true },
  { field: 'askPrice', headerName: 'Ask', cellDataType: 'number', filter: true, sortable: true, resizable: true },
  { field: 'midPrice', headerName: 'Mid', cellDataType: 'number', filter: true, sortable: true, resizable: true },
  { field: 'yieldToMaturity', headerName: 'YTM', cellDataType: 'number', filter: true, sortable: true, resizable: true },
  { field: 'quantityFace', headerName: 'Qty (Face)', cellDataType: 'number', filter: true, sortable: true, resizable: true },
  { field: 'marketValue', headerName: 'Market Value', cellDataType: 'number', filter: true, sortable: true, resizable: true },
  { field: 'unrealizedPnL', headerName: 'Unrealized PnL', cellDataType: 'number', filter: true, sortable: true, resizable: true },
];

/** Build a static (non-ticking) positions mock config with grid columns.
 *  `columnDefinitions` lives on the config object (the worker ignores it;
 *  MarketsGridContainer reads it to build AG-Grid ColDefs). */
function mockConfig(rowCount: number): MockProviderConfig & { columnDefinitions: ColDef[] } {
  return {
    providerType: 'mock',
    dataType: 'positions',
    keyColumn: 'cusip',
    rowCount,
    enableUpdates: false,
    columnDefinitions: COLUMNS,
  };
}

export const mockProviderDraftA: DataProviderConfig = {
  providerId: MOCK_PROVIDER_A_ID,
  name: 'Mock Positions A',
  providerType: 'mock',
  userId: 'dev1',
  public: false,
  config: mockConfig(50) as unknown as DataProviderConfig['config'],
};

export const mockProviderDraftB: DataProviderConfig = {
  providerId: MOCK_PROVIDER_B_ID,
  name: 'Mock Positions B',
  providerType: 'mock',
  userId: 'dev1',
  public: false,
  config: mockConfig(25) as unknown as DataProviderConfig['config'],
};
