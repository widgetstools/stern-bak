import type { LabFeatureConfig } from '../tabs/labFeatureConfigs';
import { serializeConfig } from './serializeConfig';
import type { FeatureGuide, FeatureGuideConfigBlock } from './types';

/**
 * Build the Inspector "Config" blocks for a tab. Derived from the SAME
 * LabFeatureConfig that mounts the grid, so the shown config can never drift
 * from what runs. `guide.extraConfig` (hand-authored module config) is appended.
 */
export function buildConfigBlocks(
  config: LabFeatureConfig,
  guide?: FeatureGuide,
): FeatureGuideConfigBlock[] {
  const mountProps = {
    gridId: config.gridId,
    componentName: config.componentName,
    rowIdField: 'id',
    ...(config.grid ?? {}),
  };

  const columns = config.getColumnDefs().map((col) => ({
    field: col.field,
    headerName: col.headerName,
  }));

  const blocks: FeatureGuideConfigBlock[] = [
    {
      label: 'Mount props (chrome)',
      lang: 'json',
      code: serializeConfig(mountProps),
    },
    {
      label: `Columns (${columns.length})`,
      lang: 'json',
      code: serializeConfig(columns),
    },
  ];

  if (guide?.extraConfig?.length) {
    blocks.push(...guide.extraConfig);
  }

  return blocks;
}
