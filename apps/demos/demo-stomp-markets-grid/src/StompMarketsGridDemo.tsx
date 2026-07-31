/**
 * Minimal STOMP → MarketsGrid wiring (IDataProvider hub path).
 *
 * 1. `ensurePlatformReady` + `DataHubProvider` (main.tsx)
 * 2. `ensureStompProvider` — programmatic catalog row
 * 3. `HostedMarketsGrid` + `defaultLiveProviderId` — cfg-free hub attach
 */
import { useEffect, useState } from 'react';
import { HostedMarketsGrid } from '@wellsfargo-starui/widgets-react/hosted';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/host-data-react/runtime';
import { ensureStompProvider } from './ensureStompProvider.js';
import { getPlatform } from './platformBootstrap.js';

export function StompMarketsGridDemo() {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureStompProvider(configStore, userId)
      .then((id) => {
        if (!cancelled) setProviderId(id);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-[color:var(--ds-accent-negative)]">
        Failed to seed STOMP provider: {error}
      </div>
    );
  }

  if (!providerId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[color:var(--ds-text-secondary)]">
        Seeding STOMP provider…
      </div>
    );
  }

  return (
    <HostedMarketsGrid
      gridId="stomp-demo-blotter"
      componentName="STOMP Positions"
      defaultInstanceId="stomp-demo-blotter"
      defaultLiveProviderId={providerId}
      withStorage
      configManager={getPlatform().configManager}
      showFormattingToolbar
      showEditingToolbar
      showProfileSelector
      showSaveButton
      sideBar={{ toolPanels: ['columns', 'filters'] }}
    />
  );
}
