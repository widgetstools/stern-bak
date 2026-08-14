import { StarGrid } from '@wellsfargo-starui/grid/widgets';
import { useHostedStarui } from '@wellsfargo-starui/grid/widgets/hosted';
import { StaruiIdentityProvider } from '@wellsfargo-starui/react/data/runtime';
import { getPlatform } from '../platformBootstrap';

interface HostedGridPanelProps {
  /** Stable id for the grid's profile bundle + workspace storage. */
  instanceId: string;
  /** Caption shown in the grid's chrome. */
  componentName: string;
  /** Fired when the user hits the Edit button in the in-grid toolbar.
   *  The parent should bring the editor panel to the front and pass
   *  the providerId as `initialProviderId` so it opens pre-focused. */
  onEditProvider?: (providerId: string) => void;
}

export function HostedGridPanel({ instanceId, componentName, onEditProvider }: HostedGridPanelProps) {
  const { configManager } = getPlatform();

  // Identity + ConfigService storage for <StarGrid>. appId/userId come
  // from the app's DataHubProvider bootstrap (main.tsx) — no dev-default
  // fallbacks in play.
  const { identity, ready } = useHostedStarui({
    defaultGridId: instanceId,
    componentName,
    configManager,
  });

  if (!ready || !identity) return null;

  return (
    // StarGrid's default frame fills the parent (no fixed positioning),
    // so the panel needs no containing-block tricks — unlike the old
    // always-full-bleed HostedMarketsGrid mount.
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]">
      <StaruiIdentityProvider identity={identity}>
        <StarGrid
          gridId={instanceId}
          title={componentName}
          advanced={{
            componentName,
            onEditProvider,
            showFiltersToolbar: true,
            showFormattingToolbar: true,
            showEditingToolbar: true,
            showProfileSelector: true,
            showSaveButton: true,
            showSettingsButton: true,
            sideBar: { toolPanels: ['columns', 'filters'] },
            statusBar: {
              statusPanels: [
                { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
                { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
                { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
                { statusPanel: 'agAggregationComponent', align: 'right' },
              ],
            },
          } as never}
        />
      </StaruiIdentityProvider>
    </div>
  );
}
