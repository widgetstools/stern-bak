import type { MarketsGridHandle } from '@wellsfargo-starui/grid';
import type { TabVariant } from '../components/TabContainer';
import type { LabFeatureConfig } from './labFeatureConfigs';

/**
 * Which engine supplies a lab grid's rows.
 *
 * Every feature tab offers both, against the same generated book, the same
 * columns and the same profiles — so switching is an A/B of the row engine and
 * nothing else. That is the whole point: a difference you can see after the
 * toggle is a difference the engine caused.
 */
export type LabRowEngine = 'client' | 'perspective';

export const LAB_ROW_ENGINE_VARIANTS: TabVariant[] = [
  { id: 'client', label: 'Client row model' },
  { id: 'perspective', label: 'Perspective (worker-held Table)' },
];

export function isLabRowEngine(id: string): id is LabRowEngine {
  return id === 'client' || id === 'perspective';
}

/** What each engine's grid component needs. Identical for both, by design. */
export interface LabEngineGridProps {
  config: LabFeatureConfig;
  /** Installs the tab's demo profiles on first mount. */
  onProfilesReady: (handle: MarketsGridHandle) => void;
  /** Overrides `config.stream.rowCount` — the stress tab varies it live. */
  rowCount?: number;
}
