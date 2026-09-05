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

/**
 * The instanceId this window's grid actually persists under.
 *
 * `HostedMarketsGrid` resolves its own id via `useHostedIdentity` (OpenFin
 * `customData` → `?instanceId=` → the default) and EVERY profile read and write
 * keys on that one. This view needs the same answer for three things that must
 * all address the same row: the live-sync subscription, `publishActiveProfile`,
 * and the id handed to the AI assistant.
 *
 * Deriving it independently is what let them drift. `runtime.resolveIdentity()`
 * reads `fin.View.getCurrentSync()`, which has no view to return in an
 * `asWindow` launch, so it fell back to the window NAME
 * (`registered-<entryId>-<instanceId>`) — a different string from the id the
 * grid used. The assistant then wrote a rename into one row while the grid read
 * another: the write persisted, the subscription fired against a row nothing
 * had touched, and the header never changed on screen.
 *
 * The URL param is read first because the launcher stamps it
 * (`appendLaunchIdentityParams`) precisely so the id resolves synchronously,
 * and because it is the one source both resolvers read identically.
 */
function resolveBlotterInstanceId(
  runtime: { resolveIdentity?: () => { instanceId?: string } },
): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('instanceId');
    if (fromUrl) return fromUrl;
  } catch {
    /* no window (SSR) — fall through to the runtime */
  }
  return runtime.resolveIdentity?.().instanceId || DEFAULT_INSTANCE_ID;
}

function BlottersMarketsGrid(): ReactNode {
  const { platform: { configManager } } = usePlatformBootstrap();
  const { runtime } = useStarGridApp();

  // Live config sync: an edit from the AI Assistant / Workspace Setup / another
  // window lands in this grid's config row, and re-applies here without a
  // reload. This MUST be the same row HostedMarketsGrid persists to — see
  // `resolveBlotterInstanceId`.
  const gridRef = useRef<MarketsGridHandle | null>(null);
  const instanceId = resolveBlotterInstanceId(runtime);
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
  // The wand opens an assistant tied to THIS blotter, and hands it the two
  // configIds it is defined by — never a display name, never something
  // derived from one:
  //   • `instanceId` — this window's OWN config row. Under OpenFin the launcher
  //     minted it (a singleton's window reuses the template row, so it is the
  //     template configId; a multi-instance window gets its cloned row's id).
  //   • `templateId` — the blotter's template configId, straight from the
  //     launcher's customData. The assistant resolves the registry entry from
  //     it exactly, so a blotter that was renamed, or created a moment ago in
  //     another window, still targets correctly.
  // Deriving an id here from componentType/componentSubType is only a last
  // resort for a browser-mode window that was never launched by the platform.
  const handleOpenAssistant = useCallback(() => {
    const identity = runtime.resolveIdentity?.();
    const fromLauncher = identity?.customData?.templateId;
    const gridId =
      typeof fromLauncher === 'string' && fromLauncher
        ? fromLauncher
        : identity?.componentType && identity?.componentSubType
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
