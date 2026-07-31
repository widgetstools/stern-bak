import { HostedMarketsGrid } from '@wellsfargo-starui/widgets-react/hosted';
import { getPlatform } from '../platformBootstrap';

export function PositionsBlotter() {
  const { configManager } = getPlatform();

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]"
      style={{ transform: 'translateZ(0)' }}
    >
      <HostedMarketsGrid
        gridId="positions-blotter"
        componentName="Positions Blotter"
        defaultInstanceId="positions-blotter"
        withStorage
        configManager={configManager}
        showFiltersToolbar
        showFormattingToolbar
        showEditingToolbar
        showProfileSelector
        showSaveButton
        sideBar={{ toolPanels: ['columns', 'filters'] }}
        statusBar={{
          statusPanels: [
            { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
          ],
        }}
      />
    </div>
  );
}
