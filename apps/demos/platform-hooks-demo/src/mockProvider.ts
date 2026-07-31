import type { ColumnDefinition, DataProviderConfig, MockProviderConfig } from '@wellsfargo-starui/types';

/** Columns required by MarketsGridContainer — without these the grid stays on the empty placeholder. */
const mockColumns: ColumnDefinition[] = [
  { field: 'id', headerName: 'Position ID', width: 140, filter: true, sortable: true },
  { field: 'cusip', headerName: 'CUSIP', width: 110, filter: true, sortable: true },
  { field: 'instrumentName', headerName: 'Instrument', width: 180, filter: true, sortable: true },
  { field: 'marketValue', headerName: 'MV', width: 100, type: 'numericColumn', filter: true, sortable: true },
  { field: 'notional', headerName: 'Notional', width: 110, type: 'numericColumn', filter: true, sortable: true },
  { field: 'midPrice', headerName: 'Mid', width: 90, type: 'numericColumn', filter: true, sortable: true },
];

/**
 * Mock positions cfg for the worker hub.
 * `keyColumn: 'id'` matches mockPosition row ids (`POS-{cusip}-{idx}`).
 */
const mockCfg = {
  providerType: 'mock',
  dataType: 'positions',
  rowCount: 120,
  updateIntervalMs: 900,
  enableUpdates: true,
  keyColumn: 'id',
  columnDefinitions: mockColumns,
} as MockProviderConfig & { columnDefinitions: ColumnDefinition[] };

/** Live mock provider — catalog row for configStore.save(). */
export const mockLiveProviderDraft: DataProviderConfig = {
  name: 'Mock Positions (Live)',
  providerType: 'mock',
  userId: 'dev1',
  public: false,
  config: mockCfg,
};

/** Historical slot — updates off; same schema for toolbar date demo. */
export const mockHistoricalProviderDraft: DataProviderConfig = {
  name: 'Mock Positions (Historical)',
  providerType: 'mock',
  userId: 'dev1',
  public: false,
  config: { ...mockCfg, enableUpdates: false },
};

/** Bump when transport cfg changes so App re-persists catalog rows on load. */
export const MOCK_PROVIDER_CFG_VERSION = 2;
