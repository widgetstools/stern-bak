/**
 * BlottersMarketsGrid — route view at `/blotters/marketsgrid`. Delegates
 * all hosting (identity, ConfigManager, data-services, theme,
 * full-bleed layout, legacy cleanup) to `<HostedMarketsGrid>`.
 */

import { useCallback, useRef, type ReactNode } from 'react';
import { HostedMarketsGrid } from '@wellsfargo-starui/grid/widgets/hosted';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid';
import { useStarGridApp } from '../starGridApp/index.js';
import { usePlatformBootstrap } from '../platformBootstrap';
import { openProviderEditorPopout } from '../dataProvidersPopout';
import { openAssistantPopout } from '../aiAssistantPopout';
import { useLiveProfileSync, publishActiveProfile } from '../useLiveProfileSync';

const DEFAULT_COL_DEF = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

/** Must match the `defaultInstanceId` passed to HostedMarketsGrid below. */
const DEFAULT_INSTANCE_ID = 'star-demo-blotter';

function BlottersMarketsGrid(): ReactNode {
  const { platform: { configManager } } = usePlatformBootstrap();
  const { runtime } = useStarGridApp();

  // Live config sync: an edit from the AI Assistant / Workspace Setup / another
  // window lands in this grid's config row, and re-applies here without a
  // reload. The instance id is resolved the same way HostedMarketsGrid does.
  const gridRef = useRef<MarketsGridHandle | null>(null);
  // Optional-call on purpose: live sync is a convenience, and a runtime that
  // doesn't implement identity resolution must not take the grid down with it.
  const instanceId = runtime.resolveIdentity?.().instanceId ?? DEFAULT_INSTANCE_ID;
  useLiveProfileSync({
    configManager,
    instanceId,
    getTarget: () => gridRef.current?.profiles,
  });
  const handleReady = useCallback((handle: MarketsGridHandle) => {
    gridRef.current = handle;
    // Publish which profile this window is showing, and keep it current. The
    // assistant reads this to edit the profile the user actually has selected
    // rather than always writing the default one.
    void publishActiveProfile(configManager, instanceId, handle.profiles.activeProfileId ?? '__default__');
    handle.platform.events.on('profile:loaded', ({ profileId }) => {
      void publishActiveProfile(configManager, instanceId, profileId);
    });
  }, [configManager, instanceId]);

  const handleEditProvider = useCallback(
    (providerId: string) => {
      void openProviderEditorPopout(runtime, { providerId });
    },
    [runtime],
  );
  // The wand opens an assistant tied to THIS blotter. Pass the instance id —
  // the one identifier a window always knows — and let the assistant resolve it
  // to a registry entry. Deriving a registry id here from componentType /
  // componentSubType silently produced "star-demo-blotter" (the browser-mode
  // fallback, not a registered grid) whenever those weren't populated.
  const handleOpenAssistant = useCallback(() => {
    // Two independent signals, because either can be missing: the instance id
    // (resolved against the config row) and, when the launcher supplied a
    // component identity, the registry id it implies. The assistant prefers the
    // instance and falls back to the hint.
    const identity = runtime.resolveIdentity?.();
    const gridId =
      identity?.componentType && identity?.componentSubType
        ? `${identity.componentType}-${identity.componentSubType}`.toLowerCase()
        : undefined;
    void openAssistantPopout(runtime, { instanceId, gridId });
  }, [runtime, instanceId]);

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
      defaultInstanceId={DEFAULT_INSTANCE_ID}
      onReady={handleReady}
      documentTitle="MarketsGrid · Blotter"
      withStorage
      theme="auto"
      configManager={configManager}
      gridId="star-demo-blotter"
      historicalDateAppDataRef="positions.asOfDate"
      onEditProvider={handleEditProvider}
      onOpenConfigBrowser={handleOpenConfigBrowser}
      onOpenAssistant={handleOpenAssistant}
      showFiltersToolbar
      showFormattingToolbar
      showSummaryPanel
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
