import { useMemo, useState, type ReactNode } from 'react';
import { TabContainer } from '../components/TabContainer';
import { InspectorDrawer } from '../components/InspectorDrawer';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { useLabDemoRegistry } from '../demo/LabDemoContext';
import { getFeatureGuide } from '../guides/featureGuides';
import { buildConfigBlocks } from '../guides/buildConfigBlocks';
import { LabClientGrid } from './LabClientGrid';
import { LabPerspectiveGrid } from './LabPerspectiveGrid';
import {
  isLabRowEngine,
  LAB_ROW_ENGINE_VARIANTS,
  type LabRowEngine,
} from './labRowEngine';
import type { LabFeatureConfig } from './labFeatureConfigs';

export interface LabFeatureTabProps {
  config: LabFeatureConfig;
  /** Extra toolbar controls, right-aligned (the stress tab's row-count picker). */
  actions?: ReactNode;
  /** Rows to ask the provider for — overrides `config.stream.rowCount`. */
  rowCount?: number;
}

/**
 * Shared shell for feature tabs — the row-engine picker, demo profiles, and the
 * guidance Inspector drawer, around whichever engine's grid is selected.
 *
 * The picker is `TabContainer`'s own `variants` slot, which has been here and
 * unused since the container was written. Every tab funnels through this one
 * shell, so wiring it here is what gives all sixteen a Perspective variant
 * without a per-tab edit — and the two engines run the same profiles against
 * the same columns, which is what makes switching a controlled experiment.
 *
 * Each engine is a separate component so only one set of hooks is ever live.
 * Switching remounts the grid, and it has to: a row model is chosen when
 * AG Grid is created, not changed underneath it.
 */
export function LabFeatureTab({ config, actions, rowCount }: LabFeatureTabProps) {
  const [engine, setEngine] = useState<LabRowEngine>('client');
  const onProfilesReady = useLabDemoProfiles(
    config.gridId,
    config.profiles,
    config.activeProfileId,
  );

  // The live tick rate belongs to whichever engine is mounted, and both
  // register it with the demo console — so the subtitle reads it back from
  // there rather than the shell holding a second copy that could disagree.
  const { handle } = useLabDemoRegistry();
  const tickMs = handle?.tickMs ?? config.stream?.updateIntervalMs ?? 500;

  const guide = getFeatureGuide(config.tabId);
  const configBlocks = useMemo(
    () => (guide ? buildConfigBlocks(config, guide) : []),
    [config, guide],
  );

  const subtitle = config.subtitleIncludesTickMs
    ? `${config.subtitle} · ${tickMs} ms tick · use Demo console for scenarios`
    : config.subtitle;

  const Grid = engine === 'perspective' ? LabPerspectiveGrid : LabClientGrid;

  return (
    <TabContainer
      title={config.title}
      subtitle={subtitle}
      help={config.help}
      variants={LAB_ROW_ENGINE_VARIANTS}
      activeVariant={engine}
      onVariantChange={(id) => {
        if (isLabRowEngine(id)) setEngine(id);
      }}
      actions={actions}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <Grid
            key={engine}
            config={config}
            onProfilesReady={onProfilesReady}
            rowCount={rowCount}
          />
        </div>
        {guide && (
          <InspectorDrawer guide={guide} configBlocks={configBlocks} fullDocs={config.help} />
        )}
      </div>
    </TabContainer>
  );
}
