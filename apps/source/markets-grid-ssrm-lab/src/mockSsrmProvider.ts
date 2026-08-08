/**
 * Mock SSRM catalog seed for MarketsGrid SSRM Lab.
 *
 * Same field names / row generator as markets-grid-lab CSRM mock
 * (`id`, `cusip`, `bidPrice`, `dailyPnL`, …) so feature profiles and
 * examples work without a STOMP broker.
 */

import type { ColumnDefinition, DataProviderConfig, MockSsrmProviderConfig } from '@wellsfargo-starui/types';
import { baseColumns } from './data/columns.js';

/** Bump when row shape / defaults change so App re-persists the catalog row. */
export const MOCK_SSRM_CFG_VERSION = 1;

export const MOCK_SSRM_PROVIDER_ID = 'markets-grid-ssrm-lab:positions-mock-ssrm';

const columnDefinitions: ColumnDefinition[] = baseColumns
  .filter((c): c is typeof c & { field: string } => typeof c.field === 'string' && c.field.length > 0)
  .map((c) => ({
    field: c.field,
    headerName: typeof c.headerName === 'string' ? c.headerName : c.field,
    width: typeof c.width === 'number' ? c.width : undefined,
    hide: c.hide === true,
    cellDataType:
      c.type === 'numericColumn' || c.filter === 'agNumberColumnFilter' ? 'number' : 'text',
    filter: true,
    sortable: true,
    resizable: true,
  }));

const mockSsrm: MockSsrmProviderConfig = {
  providerType: 'mock-ssrm',
  dataType: 'positions',
  rowCount: 500,
  updateIntervalMs: 500,
  enableUpdates: true,
  keyColumn: 'id',
  blockSize: 100,
  columnDefinitions,
};

export const mockSsrmProviderDraft: DataProviderConfig = {
  providerId: MOCK_SSRM_PROVIDER_ID,
  name: 'Mock SSRM Positions',
  providerType: 'mock-ssrm',
  userId: 'dev1',
  public: false,
  config: mockSsrm,
};

export const SSRM_CFG_VERSION_KEY = 'markets-grid-ssrm-lab.mock-ssrm-cfg-version';
