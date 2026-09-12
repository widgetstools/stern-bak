/**
 * The tab roster — the LAB'S OWN configs, imported, in the lab's order.
 * Feature-for-feature parity by construction: a config edit or a new lab
 * tab shows up here (or fails `tabConfigs.test.ts`), never a hand-copied
 * drifted twin. `profiles` is a custom component (preset gallery), so like
 * the lab it is not in this config-driven list.
 */
import type { LabFeatureConfig } from '../../../markets-grid-lab/src/tabs/labFeatureConfigs';
import {
  ALERTS_FEATURE,
  BULK_UPDATE_FEATURE,
  CALCULATED_FEATURE,
  COLUMN_GROUPS_FEATURE,
  CONDITIONAL_FEATURE,
  EDITING_FEATURE,
  FORMATTER_TOOLBAR_FEATURE,
  FORMATTING_FEATURE,
  LIVE_FEATURE,
  OVERVIEW_FEATURE,
  PLUS_MINUS_FEATURE,
  QUICK_FILTERS_FEATURE,
  RENDERERS_FEATURE,
  SHORTCUTS_FEATURE,
  VISUAL_EXCEL_FEATURE,
} from '../../../markets-grid-lab/src/tabs/labFeatureConfigs';

export interface SsrmTabEntry {
  id: string;
  label: string;
  hint: string;
  config: LabFeatureConfig;
}

/** Same ids, labels and order as the lab's `App.tsx` TABS (minus profiles). */
export const SSRM_TABS: SsrmTabEntry[] = [
  { id: 'overview', label: 'Overview', hint: 'Full feature kitchen-sink', config: OVERVIEW_FEATURE },
  { id: 'formatting', label: 'Formatting', hint: 'Value formatters & types', config: FORMATTING_FEATURE },
  { id: 'visual-excel', label: 'Visual Excel', hint: 'WYSIWYG styled .xlsx export', config: VISUAL_EXCEL_FEATURE },
  { id: 'renderers', label: 'Cell Renderers', hint: 'Visual cell components', config: RENDERERS_FEATURE },
  { id: 'toolbar', label: 'Formatter Toolbar', hint: 'Live cell-style toolbar', config: FORMATTER_TOOLBAR_FEATURE },
  { id: 'groups', label: 'Column Groups', hint: 'Nested header groups', config: COLUMN_GROUPS_FEATURE },
  { id: 'calc', label: 'Calculated', hint: 'Derived virtual columns', config: CALCULATED_FEATURE },
  { id: 'conditional', label: 'Conditional Style', hint: 'Expression-driven styling', config: CONDITIONAL_FEATURE },
  { id: 'filters', label: 'Quick Filters', hint: 'Saved filter pill buttons', config: QUICK_FILTERS_FEATURE },
  { id: 'live', label: 'Live Updates', hint: 'High-frequency stream', config: LIVE_FEATURE },
  { id: 'alerts', label: 'Alerts', hint: 'Triggers, toasts, bell + OpenFin', config: ALERTS_FEATURE },
  { id: 'editing', label: 'Editing', hint: 'Full editing family demo', config: EDITING_FEATURE },
  { id: 'bulk-update', label: 'Bulk Update', hint: 'Replace selection with one value', config: BULK_UPDATE_FEATURE },
  { id: 'plus-minus', label: 'Plus / Minus', hint: 'Keyboard nudge rules', config: PLUS_MINUS_FEATURE },
  { id: 'shortcuts', label: 'Shortcuts', hint: 'Letter-key arithmetic', config: SHORTCUTS_FEATURE },
];
