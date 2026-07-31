/**
 * BlottersMarketsGrid — route view at `/blotters/marketsgrid`. Delegates
 * all hosting (identity, ConfigManager, data-services, theme,
 * full-bleed layout, legacy cleanup) to `<HostedMarketsGrid>`.
 */

import { useCallback, type ReactNode } from 'react';
import { HostedMarketsGrid } from '@wellsfargo-starui/widgets-react/hosted';
import { useStarGridApp } from '../starGridApp/index.js';
import { usePlatformBootstrap } from '../platformBootstrap';
import { openProviderEditorPopout } from '../dataProvidersPopout';

const DEFAULT_COL_DEF = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

function BlottersMarketsGrid(): ReactNode {
  const { platform: { configManager } } = usePlatformBootstrap();
  const { runtime } = useStarGridApp();
  const handleEditProvider = useCallback(
    (providerId: string) => {
      void openProviderEditorPopout(runtime, { providerId });
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
    <HostedMarketsGrid
      componentName="MarketsGrid"
      defaultInstanceId="star-demo-blotter"
      documentTitle="MarketsGrid · Blotter"
      withStorage
      theme="auto"
      configManager={configManager}
      
      gridId="star-demo-blotter"
      historicalDateAppDataRef="positions.asOfDate"
      onEditProvider={handleEditProvider}
      onOpenConfigBrowser={handleOpenConfigBrowser}
      showFiltersToolbar
      showFormattingToolbar
      showEditingToolbar
      defaultColDef={DEFAULT_COL_DEF}
      // OpenFin colour-based grid linking: dock-link two blotters to the same
      // colour to share row selection (see docs/OPENFIN_GRID_LINKING.md).
      // `rowIdField` auto-derives from the active provider's key column.
      // `notify` left off — no Notification Center alerts on link traffic.
      contextLink={{ enabled: true, mode: 'fields', notify: false }}
    />
  );
}

export default BlottersMarketsGrid;
