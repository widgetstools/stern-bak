import { useEffect, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { StarGridApp } from '@wellsfargo-starui/app';
import { HostedMarketsGrid } from '@wellsfargo-starui/widgets-react/hosted';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/host-data-react/runtime';
import { getBootstrapConfig, getPlatform } from './platformBootstrap';
import { E2E_MOCK_PROVIDER_ID, e2eMockProviderDraft } from './ensureE2eMockProvider';
import { StandaloneBlotter } from './StandaloneBlotter';
import type { RowShape } from './blotterColumns';

function HubBlotter({ fullChrome }: { fullChrome: boolean }) {
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
    return <div data-testid="browser-blotter-hub-loading">Loading hub provider…</div>;
  }

  return (
    <HostedMarketsGrid
      gridId="browser-blotter-hub-v1"
      componentName="Browser Blotter"
      defaultInstanceId="browser-blotter-hub-v1"
      defaultLiveProviderId={providerId}
      withStorage
      configManager={getPlatform().configManager}
      showFiltersToolbar={fullChrome}
      showFormattingToolbar={fullChrome}
      showEditingToolbar={fullChrome}
      showProfileSelector={fullChrome}
      showSaveButton={fullChrome}
    />
  );
}

function ConfigBlotter({
  onGridReady,
}: {
  onGridReady?: (api: GridApi<RowShape>) => void;
}) {
  const config = getBootstrapConfig();
  return (
    <StarGridApp
      appId={config.appId}
      userId={config.userId}
      instanceId="browser-blotter-config-v1"
      persistence="config"
      configManager={getPlatform().configManager}
    >
      <StandaloneBlotter onGridReady={onGridReady} />
    </StarGridApp>
  );
}

export { HubBlotter, ConfigBlotter };
