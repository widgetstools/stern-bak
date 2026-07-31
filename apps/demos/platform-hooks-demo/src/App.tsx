import { useEffect, useMemo, useState } from 'react';
import { createMarketsGridLocalStorageStorage } from '@wellsfargo-starui/grid';
import { MarketsGridContainer } from '@wellsfargo-starui/widgets-react/markets-grid-container';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/host-data-react/runtime';
import { gridEventHandlers } from './platform/gridEventHandlers.js';
import { gridHandlerMeta } from './platform/hooksMeta.js';
import { mockHistoricalProviderDraft, mockLiveProviderDraft, MOCK_PROVIDER_CFG_VERSION } from './mockProvider.js';
import { DemoSidebar } from './components/DemoSidebar.js';

const GRID_ID = 'hooks-demo-blotter';
const INSTANCE_ID = 'hooks-demo';

export function App() {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [liveProviderId, setLiveProviderId] = useState<string | null>(null);
  const [historicalProviderId, setHistoricalProviderId] = useState<string | null>(null);
  const storage = useMemo(() => createMarketsGridLocalStorageStorage(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId, { subtype: 'mock' });
      const existingLive = rows.find((p) => p.name === mockLiveProviderDraft.name);
      const existingHist = rows.find((p) => p.name === mockHistoricalProviderDraft.name);

      // Re-save on every load when cfg version bumps so IndexedDB picks up column/key fixes.
      const liveDraft: typeof mockLiveProviderDraft = existingLive
        ? { ...mockLiveProviderDraft, providerId: existingLive.providerId }
        : mockLiveProviderDraft;
      const histDraft: typeof mockHistoricalProviderDraft = existingHist
        ? { ...mockHistoricalProviderDraft, providerId: existingHist.providerId }
        : mockHistoricalProviderDraft;

      const storedVersion = localStorage.getItem('platform-hooks-demo.mock-cfg-version');
      const shouldRefresh = storedVersion !== String(MOCK_PROVIDER_CFG_VERSION);

      const liveId = shouldRefresh || !existingLive
        ? (await configStore.save(liveDraft, userId)).providerId
        : existingLive.providerId;
      const histId = shouldRefresh || !existingHist
        ? (await configStore.save(histDraft, userId)).providerId
        : existingHist.providerId;

      if (shouldRefresh) {
        localStorage.setItem('platform-hooks-demo.mock-cfg-version', String(MOCK_PROVIDER_CFG_VERSION));
      }

      if (!cancelled && liveId) setLiveProviderId(liveId);
      if (!cancelled && histId) setHistoricalProviderId(histId);
    })();
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  if (!liveProviderId || !historicalProviderId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[color:var(--ds-text-secondary)]">
        Seeding mock providers…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <DemoSidebar gridId={GRID_ID} />
      <div className="relative min-w-0 flex-1">
        <MarketsGridContainer
          gridId={GRID_ID}
          instanceId={INSTANCE_ID}
          appId="platform-hooks-demo"
          userId={userId}
          componentName="Platform Hooks Demo"
          storage={storage}
          defaultLiveProviderId={liveProviderId}
          defaultHistoricalProviderId={historicalProviderId}
          historicalDateAppDataRef="positions.asOfDate"
          gridEventHandlers={gridEventHandlers}
          handlerMeta={gridHandlerMeta}
          showFiltersToolbar
          showFormattingToolbar
          showEditingToolbar
        />
      </div>
    </div>
  );
}
