import type { DataProviderConfig } from '@wellsfargo-starui/types';

export const E2E_MOCK_PROVIDER_ID = 'e2e-openfin-workspace-mock';

export const e2eMockProviderDraft: DataProviderConfig = {
  name: 'E2E OpenFin Workspace Mock',
  providerType: 'mock',
  userId: 'dev1',
  public: false,
  config: {
    providerType: 'mock',
    dataType: 'orders',
    rowCount: 500,
    updateIntervalMs: 50,
    enableUpdates: true,
    keyColumn: 'id',
  },
};
