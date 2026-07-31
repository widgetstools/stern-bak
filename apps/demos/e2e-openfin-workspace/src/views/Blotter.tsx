/**
 * Blotter view — hub-backed MarketsGrid inside an OpenFin view (or browser dev).
 */
import { useEffect, useState } from 'react';
import { HostedMarketsGrid } from '@wellsfargo-starui/widgets-react/hosted';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/host-data-react/runtime';
import { getPlatform } from '../platformBootstrap';
import { E2E_MOCK_PROVIDER_ID, e2eMockProviderDraft } from '../ensureE2eMockProvider';

export const GRID_ID = 'openfin-workspace-blotter-v1';

export function Blotter() {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [providerId, setProviderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId, { subtype: 'mock' });
      const existing = rows.find((p) => p.name === e2eMockProviderDraft.name);
      const id =
        existing?.providerId ??
        (await configStore.save(e2eMockProviderDraft, userId)).providerId ??
        E2E_MOCK_PROVIDER_ID;
      if (!cancelled) setProviderId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  if (!providerId) {
    return (
      <div data-testid="openfin-workspace-blotter-loading" style={{ padding: 16 }}>
        Loading hub provider…
      </div>
    );
  }

  return (
    <div
      data-testid="openfin-workspace-blotter"
      style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}
    >
      <div
        data-testid="openfin-workspace-blotter-grid-id"
        style={{
          padding: '6px 10px',
          background: 'var(--ds-surface-primary)',
          color: 'var(--ds-text-primary)',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          borderBottom: '1px solid var(--ds-border-secondary)',
        }}
      >
        gridId: <code>{GRID_ID}</code>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <HostedMarketsGrid
          gridId={GRID_ID}
          componentName="OpenFin Blotter"
          defaultInstanceId={GRID_ID}
          defaultLiveProviderId={providerId}
          withStorage
          configManager={getPlatform().configManager}
          showFiltersToolbar
          showFormattingToolbar
          showEditingToolbar
        />
      </div>
    </div>
  );
}
