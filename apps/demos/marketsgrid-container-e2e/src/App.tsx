import { useEffect, useState } from 'react';
import { HostedMarketsGrid } from '@wellsfargo-starui/widgets-react/hosted';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/host-data-react/runtime';
import { getPlatform } from './bootstrap.js';
import {
  mockProviderDraftA,
  mockProviderDraftB,
  MOCK_PROVIDER_A_ID,
  MOCK_PROVIDER_B_ID,
  MOCK_PROVIDER_CFG_VERSION,
} from './mockProvider.js';

/**
 * Seeds two deterministic `mock` provider rows into the catalog, then
 * mounts HostedMarketsGrid (→ MarketsGridContainer) bound to provider A.
 * Provider B is selectable from the customizer's Custom Settings tab, which
 * is what exercises the save-and-switch path.
 */
export function App() {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId);
      const hasA = rows.some((p) => p.providerId === MOCK_PROVIDER_A_ID);
      const hasB = rows.some((p) => p.providerId === MOCK_PROVIDER_B_ID);

      const versionKey = 'marketsgrid-container-e2e.cfg-version';
      const refresh = localStorage.getItem(versionKey) !== String(MOCK_PROVIDER_CFG_VERSION);

      if (refresh || !hasA) await configStore.save(mockProviderDraftA, userId);
      if (refresh || !hasB) await configStore.save(mockProviderDraftB, userId);
      if (refresh) localStorage.setItem(versionKey, String(MOCK_PROVIDER_CFG_VERSION));

      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [configStore, userId]);

  if (!ready) return null;

  return (
    <HostedMarketsGrid
      gridId="mock-blotter"
      componentName="Mock Positions"
      defaultInstanceId="mock-blotter"
      defaultLiveProviderId={MOCK_PROVIDER_A_ID}
      defaultHistoricalProviderId={MOCK_PROVIDER_B_ID}
      withStorage
      configManager={getPlatform().configManager}
      showFiltersToolbar
      showFormattingToolbar
      showEditingToolbar
    />
  );
}
