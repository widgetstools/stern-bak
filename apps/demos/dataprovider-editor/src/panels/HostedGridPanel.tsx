import { HostedMarketsGrid } from '@wellsfargo-starui/widgets-react/hosted';
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

  return (
    // `transform: translateZ(0)` creates a fixed-position containing
    // block so HostedMarketsGrid's internal `position: fixed; inset: 0`
    // pins to this panel instead of the viewport. (HostedMarketsGrid
    // is designed for OpenFin views that own the whole viewport; its
    // full-bleed style escapes any normal parent unless the parent
    // forms a new containing block.)
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]"
      style={{ transform: 'translateZ(0)' }}
    >
      <HostedMarketsGrid
        gridId={instanceId}
        componentName={componentName}
        defaultInstanceId={instanceId}
        defaultUserId="dev1"
        withStorage
        configManager={configManager}
        onEditProvider={onEditProvider}
        showFiltersToolbar
        showFormattingToolbar
        showEditingToolbar
        showProfileSelector
        showSaveButton
        showSettingsButton
        sideBar={{ toolPanels: ['columns', 'filters'] }}
        statusBar={{
          statusPanels: [
            { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
            { statusPanel: 'agAggregationComponent', align: 'right' },
          ],
        }}
      />
    </div>
  );
}
