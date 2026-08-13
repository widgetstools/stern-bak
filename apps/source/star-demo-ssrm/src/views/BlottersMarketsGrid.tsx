/**
 * BlottersMarketsGrid — route view at `/blotters/marketsgrid`. Delegates
 * all hosting (identity, ConfigManager, data-services, theme,
 * full-bleed layout, legacy cleanup) to `<HostedSsrmMarketsGrid>` —
 * the server-side row model twin of star-demo's blotter, driven by the
 * seeded `stomp-ssrm` provider.
 */

import { useCallback, type ReactNode } from 'react';
import { HostedSsrmMarketsGrid } from '@wellsfargo-starui/grid/widgets/hosted';
import { useStarGridApp } from '../starGridApp/index.js';
import { usePlatformBootstrap } from '../platformBootstrap';
import { openProviderEditorPopout } from '../dataProvidersPopout';

const DEFAULT_COL_DEF = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

/** The seeded `stomp-ssrm` provider — `appConfig` row in public/seed.json. */
const SSRM_PROVIDER_ID = 'dp-121e4569-5100-4f6b-b946-c3423d8aff7c';

function BlottersMarketsGrid(): ReactNode {
  const { platform: { configManager } } = usePlatformBootstrap();
  const { runtime } = useStarGridApp();
  const handleEditProvider = useCallback(
    (providerId: string | null) => {
      void openProviderEditorPopout(runtime, {
        providerId: providerId ?? SSRM_PROVIDER_ID,
      });
    },
    [runtime],
  );
  const handleOpenConfigBrowser = useCallback(() => {
    void runtime.openSurface({
      kind: 'popout',
      url: `${window.location.origin}/#/config-browser`,
      windowName: 'config-browser',
      width: 1100,
      height: 720,
    });
  }, [runtime]);

  return (
    <HostedSsrmMarketsGrid
      providerId={SSRM_PROVIDER_ID}
      componentName="MarketsGrid"
      defaultInstanceId="star-demo-ssrm-blotter"
      documentTitle="MarketsGrid · SSRM Blotter"
      withStorage
      theme="auto"
      configManager={configManager}
      gridId="star-demo-ssrm-blotter"
      // historicalDateAppDataRef is omitted: the historical-date subsystem
      // (AppData-driven asOfDate + provider restart) is CSRM-container
      // machinery with no SSRM counterpart yet.
      onEditProvider={handleEditProvider}
      onOpenConfigBrowser={handleOpenConfigBrowser}
      showFiltersToolbar
      showFormattingToolbar
      showEditingToolbar
      defaultColDef={DEFAULT_COL_DEF}
      // OpenFin colour-based grid linking: dock-link two blotters to the same
      // colour to share row selection (see docs/OPENFIN_GRID_LINKING.md).
      // `rowIdField` auto-derives from the active provider's key column; group
      // and select-all selections resolve their leaf keys via the worker.
      // `notify` left off — no Notification Center alerts on link traffic.
      contextLink={{ enabled: true, mode: 'fields', notify: false }}
    />
  );
}

export default BlottersMarketsGrid;
