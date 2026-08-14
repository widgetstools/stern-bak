/**
 * BlottersMarketsGrid — route view at `/blotters/marketsgrid`.
 *
 * Phase-1 front door: `<StarGrid>` renders the blotter (CSRM inferred
 * from the seeded `stomp` provider rows the customizer picks between);
 * identity comes from `<StaruiIdentityProvider>` fed by
 * `useHostedStarui`, which resolves the per-view instance id (OpenFin
 * customData / URL) and the ConfigService storage factory the hosted
 * wrapper used to build.
 */

import { useCallback, type ReactNode } from 'react';
import { StarGrid } from '@wellsfargo-starui/grid/widgets';
import { useHostedStarui } from '@wellsfargo-starui/grid/widgets/hosted';
import { StaruiIdentityProvider } from '@wellsfargo-starui/react/data/runtime';
import { useStarGridApp } from '../starGridApp/index.js';
import { usePlatformBootstrap } from '../platformBootstrap';
import { openProviderEditorPopout } from '../dataProvidersPopout';

const DEFAULT_COL_DEF = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

const LOADING_STYLE = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  height: '100%',
  fontSize: 12,
  color: 'var(--ds-text-muted)',
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

  // Per-view id (restored workspace views keep their own profiles) +
  // ConfigService storage — same resolution the hosted wrapper ran.
  const { gridId: instanceId, identity, ready } = useHostedStarui({
    defaultGridId: 'star-demo-blotter',
    componentName: 'MarketsGrid',
    configManager,
  });

  if (!ready || !identity || !instanceId) {
    return <div style={LOADING_STYLE}>Connecting to ConfigService…</div>;
  }

  return (
    <StaruiIdentityProvider identity={identity}>
      <StarGrid
        gridId="star-demo-blotter"
        title="MarketsGrid"
        fullBleed
        documentTitle="MarketsGrid · Blotter"
        // OpenFin colour-based grid linking: dock-link two blotters to the
        // same colour to share row selection (docs/OPENFIN_GRID_LINKING.md).
        // `rowIdField` auto-derives from the active provider's key column.
        // `notify` left off — no Notification Center alerts on link traffic.
        contextLink={{ enabled: true, mode: 'fields', notify: false }}
        advanced={{
          // Profiles stay keyed by the RESOLVED per-view id while the
          // grid-level row keeps the logical grid key — exact parity with
          // the hosted wrapper's two-level identity.
          instanceId,
          componentName: 'MarketsGrid',
          historicalDateAppDataRef: 'positions.asOfDate',
          onEditProvider: handleEditProvider,
          onOpenConfigBrowser: handleOpenConfigBrowser,
          showFiltersToolbar: true,
          showFormattingToolbar: true,
          showEditingToolbar: true,
          defaultColDef: DEFAULT_COL_DEF,
        } as never}
      />
    </StaruiIdentityProvider>
  );
}

export default BlottersMarketsGrid;
