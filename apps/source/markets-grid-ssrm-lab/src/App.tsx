import { useEffect, useState } from 'react';
import { HostedSsrmMarketsGrid } from '@wellsfargo-starui/grid/widgets/hosted';
import { TooltipProvider } from '@wellsfargo-starui/react';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/react/data/runtime';
import { ThemeToggle } from './components/ThemeToggle.js';
import { getPlatform } from './bootstrap.js';
import {
  SSRM_CFG_VERSION_KEY,
  STOMP_SSRM_CFG_VERSION,
  STOMP_SSRM_PROVIDER_ID,
  stompSsrmProviderDraft,
} from './stompSsrmProvider.js';

/**
 * MarketsGrid SSRM Lab — lab shell chrome + SSRM-only MarketsGrid.
 * Seeds a `stomp-ssrm` catalog row and mounts {@link HostedSsrmMarketsGrid}
 * (full MarketsGrid host chrome via the `ssrm` prop).
 */
export function App() {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [providerId, setProviderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId, { subtype: 'stomp-ssrm' });
      const exists = rows.some((p) => p.providerId === STOMP_SSRM_PROVIDER_ID);
      const storedVersion = localStorage.getItem(SSRM_CFG_VERSION_KEY);
      const shouldRefresh = storedVersion !== String(STOMP_SSRM_CFG_VERSION);
      if (shouldRefresh || !exists) {
        await configStore.save(stompSsrmProviderDraft, userId);
      }
      if (shouldRefresh) {
        localStorage.setItem(SSRM_CFG_VERSION_KEY, String(STOMP_SSRM_CFG_VERSION));
      }
      if (!cancelled) setProviderId(STOMP_SSRM_PROVIDER_ID);
    })();
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-4">
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-[14px] font-semibold tracking-tight">
              MarketsGrid SSRM Lab
            </h1>
            <p className="truncate text-[11px] text-[color:var(--ds-text-secondary)]">
              Server-side row model · full MarketsGrid chrome · STOMP on :8081
            </p>
          </div>
          <ThemeToggle />
        </header>

        <main className="relative min-h-0 flex-1">
          {!providerId ? (
            <div className="flex h-full items-center justify-center text-[13px] text-[color:var(--ds-text-secondary)]">
              Seeding SSRM provider…
            </div>
          ) : (
            <HostedSsrmMarketsGrid
              providerId={providerId}
              inlineCfg={stompSsrmProviderDraft.config}
              title="SSRM Positions"
              componentName="SSRM Positions"
              defaultInstanceId="ssrm-lab-blotter"
              withStorage
              configManager={getPlatform().configManager}
              showProviderEditor={false}
            />
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
