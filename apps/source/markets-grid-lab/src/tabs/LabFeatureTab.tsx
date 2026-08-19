import { useMemo } from 'react';
import { MarketsGrid } from '@wellsfargo-starui/grid/core';
import { TabContainer } from '../components/TabContainer';
import { InspectorDrawer } from '../components/InspectorDrawer';
import { defaultColDef } from '../data/columns';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { useLabRows } from '../demo/useLabRows';
import { getFeatureGuide } from '../guides/featureGuides';
import { buildConfigBlocks } from '../guides/buildConfigBlocks';
import type { LabFeatureConfig } from './labFeatureConfigs';

export interface LabFeatureTabProps {
  config: LabFeatureConfig;
}

/**
 * Shared shell for feature tabs — wires the mock stream, demo profiles, and
 * MarketsGrid from a declarative config, then renders the guidance Inspector
 * drawer (What/Why · Try · Config · Props) sourced from the feature guide.
 */
export function LabFeatureTab({ config }: LabFeatureTabProps) {
  const onProfilesReady = useLabDemoProfiles(
    config.gridId,
    config.profiles,
    config.activeProfileId,
  );
  const { rowData, onReady, tickMs } = useLabRows(
    config.tabId,
    config.providerId,
    config.stream ?? { rowCount: 500, updateIntervalMs: 500 },
    onProfilesReady,
  );

  const columnDefs = useMemo(() => config.getColumnDefs(), [config]);
  const colDefBase = config.defaultColDef ?? defaultColDef;

  const guide = getFeatureGuide(config.tabId);
  const configBlocks = useMemo(
    () => (guide ? buildConfigBlocks(config, guide) : []),
    [config, guide],
  );

  const subtitle = config.subtitleIncludesTickMs
    ? `${config.subtitle} · ${tickMs} ms tick · use Demo console for scenarios`
    : config.subtitle;

  const grid = config.grid ?? {};

  return (
    <TabContainer title={config.title} subtitle={subtitle} help={config.help}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <MarketsGrid
            gridId={config.gridId}
            componentName={config.componentName}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={colDefBase}
            rowIdField="id"
            storage={labStorage}
            onReady={onReady}
            showProfileSelector={grid.showProfileSelector ?? true}
            showSaveButton={grid.showSaveButton ?? true}
            showSettingsButton={grid.showSettingsButton ?? true}
            showFiltersToolbar={grid.showFiltersToolbar}
            showFormattingToolbar={grid.showFormattingToolbar}
            showEditingToolbar={grid.showEditingToolbar}
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
