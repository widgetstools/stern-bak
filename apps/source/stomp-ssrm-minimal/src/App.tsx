import { useEffect, useState } from 'react';
import type { GridReadyEvent } from 'ag-grid-community';
import { HostedSsrmMarketsGrid } from '@wellsfargo-starui/grid/widgets/hosted';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/react/data/runtime';
import { getPlatform } from './bootstrap.js';
import { gridEventHandlers } from './platform/gridEventHandlers.js';
import { gridHandlerMeta } from './platform/hooksMeta.js';
import {
  stompSsrmProviderDraft,
  STOMP_SSRM_PROVIDER_CFG_VERSION,
  STOMP_SSRM_PROVIDER_ID,
} from './stompProvider.js';

function groupOnReady(colId: string) {
  return (event: GridReadyEvent) => {
    event.api.applyColumnState({
      state: [{ colId, rowGroup: true, rowGroupIndex: 0 }],
      defaultState: { rowGroup: false },
    });
  };
}

export function App() {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [providerId, setProviderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await configStore.list(userId, { subtype: 'stomp-ssrm' });
      const exists = rows.some((p) => p.providerId === STOMP_SSRM_PROVIDER_ID);
      const storedVersion = localStorage.getItem('stomp-ssrm-minimal.cfg-version');
      const shouldRefresh = storedVersion !== String(STOMP_SSRM_PROVIDER_CFG_VERSION);
      if (shouldRefresh || !exists) await configStore.save(stompSsrmProviderDraft, userId);
      if (shouldRefresh) {
        localStorage.setItem('stomp-ssrm-minimal.cfg-version', String(STOMP_SSRM_PROVIDER_CFG_VERSION));
      }
      if (!cancelled) setProviderId(STOMP_SSRM_PROVIDER_ID);
    })();
    return () => { cancelled = true; };
  }, [configStore, userId]);

  if (!providerId) return null;

  const shared = {
    defaultLiveProviderId: providerId,
    withStorage: true as const,
    configManager: getPlatform().configManager,
    gridEventHandlers,
    handlerMeta: gridHandlerMeta,
    // Same chrome as the CSRM demo: filters row, formatter toolbar (which
    // also enables the View menu's Auto Format item), editing toolbar.
    showFiltersToolbar: true,
    showFormattingToolbar: true,
    showEditingToolbar: true,
    sideBar: true as const,
    defaultColDef: { enableRowGroup: true, enableValue: true },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 8 }}>
      <HostedSsrmMarketsGrid
        gridId="stomp-ssrm-desk"
        componentName="SSRM by Desk"
        defaultInstanceId="stomp-ssrm-desk"
        caption="SSRM · grouped by desk"
        //onGridReady={groupOnReady('desk')}
        {...shared}
      />/
      
    </div>
  );
}
