/**
 * Shared shell for every feature tab — the SSRM twin of the lab's
 * `LabFeatureTab`, rendering the SAME `LabFeatureConfig` (imported from the
 * lab, so parity cannot drift) against `MarketsGrid`'s `ssrm` prop instead
 * of `rowData`. One worker-hosted mock-ssrm provider feeds every tab; the
 * per-tab stream options apply through `restart(extra)` and the demo rail
 * drives the same provider. The tab's parity verdict renders above the grid.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { GridApi } from 'ag-grid-community';
import { MarketsGrid, type MarketsGridHandle } from '@wellsfargo-starui/grid';
import { useSsrmDataProvider } from '@wellsfargo-starui/react/data/runtime';
import { TabContainer } from '../../markets-grid-lab/src/components/TabContainer';
import { InspectorDrawer } from '../../markets-grid-lab/src/components/InspectorDrawer';
import { defaultColDef } from '../../markets-grid-lab/src/data/columns';
import { useLabDemoProfiles } from '../../markets-grid-lab/src/data/useLabDemoProfiles';
import { labStorage } from '../../markets-grid-lab/src/data/storage';
import { getFeatureGuide } from '../../markets-grid-lab/src/guides/featureGuides';
import { buildConfigBlocks } from '../../markets-grid-lab/src/guides/buildConfigBlocks';
import type { LabFeatureConfig } from '../../markets-grid-lab/src/tabs/labFeatureConfigs';
import { useSsrmDemoRegistry } from './demo/SsrmDemoContext';
import { streamRestartExtra } from './ssrm/labSsrmProvider';
import { withSsrmSafeColumns } from './ssrm/ssrmColumnDefs';
import { parityFor } from './parity/parityNotes';
import { SsrmParityBadge } from './parity/SsrmParityBadge';

export interface SsrmLabFeatureTabProps {
  config: LabFeatureConfig;
  providerId: string;
}

export function SsrmLabFeatureTab({ config, providerId }: SsrmLabFeatureTabProps) {
  // Seed against the SSRM grid's OWN id — the storage adapter is scoped to
  // `<gridId>-ssrm`, and a seed built for the lab's id fails the adapter's
  // gridId check silently (caught live: "demo profile install failed").
  const onProfilesReady = useLabDemoProfiles(
    `${config.gridId}-ssrm`,
    config.profiles,
    config.activeProfileId,
  );
  const { provider } = useSsrmDataProvider(providerId, { autoStart: true });
  const { register } = useSsrmDemoRegistry();
  const gridApiRef = useRef<GridApi | null>(null);

  // Per-tab stream options (Live Updates runs hotter than the default) ride
  // a restart overlay; the hub skips restarts whose extra equals the active
  // one, so default tabs never churn the provider.
  useEffect(() => {
    if (!provider) return;
    const extra = streamRestartExtra(config.stream);
    if (extra) void provider.restart(extra);
  }, [provider, config]);

  // Publish this tab's handle to the demo rail; withdraw on unmount.
  useEffect(() => {
    if (!provider) return undefined;
    register({
      tabId: config.tabId,
      provider,
      getGridApi: () => gridApiRef.current,
    });
    return () => register(null);
  }, [provider, config.tabId, register]);

  const onReady = useCallback(
    (handle: MarketsGridHandle) => {
      gridApiRef.current = handle.gridApi;
      onProfilesReady(handle);
    },
    [onProfilesReady],
  );

  const columnDefs = useMemo(() => withSsrmSafeColumns(config.getColumnDefs()), [config]);
  const colDefBase = config.defaultColDef ?? defaultColDef;

  const guide = getFeatureGuide(config.tabId);
  const configBlocks = useMemo(
    () => (guide ? buildConfigBlocks(config, guide) : []),
    [config, guide],
  );
  const parity = parityFor(config.tabId);

  const ssrm = useMemo(
    () => (provider ? { provider, keyColumn: 'id' as const, cacheBlockSize: 200 } : null),
    [provider],
  );

  const grid = config.grid ?? {};

  return (
    <TabContainer title={`${config.title} · SSRM`} subtitle={config.subtitle} help={config.help}>
      <div className="flex min-h-0 flex-1 flex-col">
        {parity ? <SsrmParityBadge entry={parity} /> : null}
        <div className="flex min-h-0 flex-1 flex-col">
          {ssrm ? (
            <MarketsGrid
              gridId={`${config.gridId}-ssrm`}
              componentName={`${config.componentName} (SSRM)`}
              rowData={[]}
              ssrm={ssrm}
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
              showSmartEditToolbar={grid.showSmartEditToolbar}
              showBulkUpdateToolbar={grid.showBulkUpdateToolbar}
              showEditHistoryToolbar={grid.showEditHistoryToolbar}
              showVisualExcelExport={grid.showVisualExcelExport}
              sideBar={grid.sideBar}
              statusBar={grid.statusBar}
              rowHeight={grid.rowHeight}
            />
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-[color:var(--ds-text-secondary)]">
              Starting SSRM provider…
            </div>
          )}
        </div>
        {guide && (
          <InspectorDrawer guide={guide} configBlocks={configBlocks} fullDocs={config.help} />
        )}
      </div>
    </TabContainer>
  );
}
