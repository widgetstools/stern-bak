import { useMemo } from 'react';
import { TabContainer } from '../components/TabContainer';
import { InspectorDrawer } from '../components/InspectorDrawer';
import { defaultColDef } from '../data/columns';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { getFeatureGuide } from '../guides/featureGuides';
import { buildConfigBlocks } from '../guides/buildConfigBlocks';
import { SsrmLabGrid } from '../ssrm/SsrmLabGrid';
import type { LabFeatureConfig } from './labFeatureConfigs';

export interface LabFeatureTabProps {
  config: LabFeatureConfig;
}

/**
 * Shared shell for feature tabs — same lab chrome as CSRM markets-grid-lab,
 * but mounts MarketsGrid with `ssrm` (server-side row model) instead of
 * mock-stream `rowData`.
 */
export function LabFeatureTab({ config }: LabFeatureTabProps) {
  const onProfilesReady = useLabDemoProfiles(
    config.gridId,
    config.profiles,
    config.activeProfileId,
  );

  const columnDefs = useMemo(() => config.getColumnDefs(), [config]);
  const colDefBase = config.defaultColDef ?? defaultColDef;

  const guide = getFeatureGuide(config.tabId);
  const configBlocks = useMemo(
    () => (guide ? buildConfigBlocks(config, guide) : []),
    [config, guide],
  );

  const subtitle = config.subtitleIncludesTickMs
    ? `${config.subtitle} · SSRM live ticks from STOMP broker`
    : `${config.subtitle} · SSRM`;

  const grid = config.grid ?? {};

  return (
    <TabContainer title={config.title} subtitle={subtitle} help={config.help}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <SsrmLabGrid
            gridId={config.gridId}
            componentName={config.componentName}
            columnDefs={columnDefs}
            defaultColDef={colDefBase}
            onReady={onProfilesReady}
            showProfileSelector={grid.showProfileSelector ?? true}
            showSaveButton={grid.showSaveButton ?? true}
            showSettingsButton={grid.showSettingsButton ?? true}
            showFiltersToolbar={grid.showFiltersToolbar}
            showFormattingToolbar={grid.showFormattingToolbar}
            showEditingToolbar={grid.showEditingToolbar}
            showSmartEditToolbar={grid.showSmartEditToolbar}
            showBulkUpdateToolbar={grid.showBulkUpdateToolbar}
            showEditHistoryToolbar={grid.showEditHistoryToolbar}
            showVisualExcelExport={grid.showVisualExcelExport}
            sideBar={grid.sideBar}
            statusBar={grid.statusBar}
            rowHeight={grid.rowHeight}
          />
        </div>
        {guide && (
          <InspectorDrawer guide={guide} configBlocks={configBlocks} fullDocs={config.help} />
        )}
      </div>
    </TabContainer>
  );
}
