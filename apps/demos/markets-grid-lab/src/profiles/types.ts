import type { ColDef } from 'ag-grid-community';
import type { ReactElement } from 'react';
import type { LabRow } from '../data/types';
import type { LabDemoProfileEntry } from './labProfileKit';

export interface ProfilePreset {
  /** Stable id — also used as the localStorage gridId for the preset's grid. */
  id: string;
  /** Display name in the gallery card. */
  name: string;
  /** Short tagline shown on the card. */
  tagline: string;
  /** Markdown body explaining the preset (rendered in the help drawer). */
  description: string;
  /** Card accent — small visual indicator. */
  accent: 'blue' | 'green' | 'amber' | 'purple' | 'pink' | 'slate';
  /** Optional icon — a Lucide React element. */
  icon?: ReactElement;
  /** Build the column defs for this preset's grid. */
  buildColumns: () => ColDef<LabRow>[];
  /** Override `defaultColDef`. */
  defaultColDef?: ColDef<LabRow>;
  /** Override row height. */
  rowHeight?: number;
  /** Toolbar visibility flags. */
  toolbars?: {
    showFiltersToolbar?: boolean;
    showFormattingToolbar?: boolean;
    showEditingToolbar?: boolean;
  };
  /** Stream override — slower / faster for the preset. */
  stream?: { rowCount?: number; updateIntervalMs?: number };
  /**
   * Optional module-state profiles installed on first mount (same as feature
   * tabs). `id` is used as `gridId` for localStorage scoping.
   */
  demoProfiles?: LabDemoProfileEntry[];
  activeDemoProfileId?: string;
}
