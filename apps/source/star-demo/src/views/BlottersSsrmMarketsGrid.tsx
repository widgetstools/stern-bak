/**
 * BlottersSsrmMarketsGrid — route at `/blotters/ssrmmarketsgrid`.
 *
 * SSRM mode is selected at runtime via the grid customizer (live provider
 * type `stomp-ssrm`). Instance / grid identity comes from the launch URL
 * (`?instanceId=` / `?id=`) or OpenFin view customData — not from fixed
 * ids in this module.
 */

import { useCallback, type ReactNode } from 'react';
import { HostedSsrmMarketsGrid } from '@wellsfargo-starui/grid/widgets/hosted';
import { useStarGridApp } from '../starGridApp/index.js';
import { usePlatformBootstrap } from '../platformBootstrap';
import { openProviderEditorPopout } from '../dataProvidersPopout';
import { isOpenFinHost, readLaunchInstanceId } from '../readLaunchInstanceId.js';

const DEFAULT_COL_DEF = {
  enableRowGroup: true,
  enableValue: true,
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

const MISSING_INSTANCE_STYLE: React.CSSProperties = {
  padding: 16,
  lineHeight: 1.5,
};

function BlottersSsrmMarketsGrid(): ReactNode {
  const { platform: { configManager } } = usePlatformBootstrap();
  const { runtime } = useStarGridApp();
  const launchInstanceId = readLaunchInstanceId();

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

  if (!launchInstanceId && !isOpenFinHost()) {
    return (
      <div style={MISSING_INSTANCE_STYLE}>
        <p>
          SSRM MarketsGrid needs a registered instance id. Launch this component from the
          workspace registry in OpenFin, or add{' '}
          <code>?instanceId=&lt;configId&gt;</code> to the URL (same stamp as registry launch).
        </p>
        <p>
          Create a <code>stomp-ssrm</code> data provider in Data Providers, then bind it in the
          grid customizer.
        </p>
      </div>
    );
  }

  const instanceKey = launchInstanceId ?? '';

  return (
    <HostedSsrmMarketsGrid
      componentName="SsrmMarketsGrid"
      defaultInstanceId={instanceKey}
      documentTitle="MarketsGrid · SSRM"
      withStorage
      theme="auto"
      configManager={configManager}
      gridId={instanceKey}
      onEditProvider={handleEditProvider}
      onOpenConfigBrowser={handleOpenConfigBrowser}
      showFiltersToolbar
      showFormattingToolbar
      showEditingToolbar
      sideBar
      defaultColDef={DEFAULT_COL_DEF}
      contextLink={{ enabled: true, mode: 'fields', notify: false }}
    />
  );
}

export default BlottersSsrmMarketsGrid;
