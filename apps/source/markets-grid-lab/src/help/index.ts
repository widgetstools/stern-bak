// Vite `?raw` loads the file content as a string at build time.
import overview from './overview.md?raw';
import formatting from './formatting.md?raw';
import renderers from './renderers.md?raw';
import formatterToolbar from './formatter-toolbar.md?raw';
import columnGroups from './column-groups.md?raw';
import calculatedColumns from './calculated-columns.md?raw';
import conditionalStyling from './conditional-styling.md?raw';
import liveUpdates from './live-updates.md?raw';
import profiles from './profiles.md?raw';
import alerts from './alerts.md?raw';
import quickFilters from './quick-filters.md?raw';
import smartEdit from './smart-edit.md?raw';
import editHistory from './edit-history.md?raw';
import bulkUpdate from './bulk-update.md?raw';
import editing from './editing.md?raw';
import plusMinus from './plus-minus.md?raw';
import shortcuts from './shortcuts.md?raw';
import visualExcel from './visual-excel.md?raw';
import stressTest from './stress-test.md?raw';

export const HELP = {
  overview,
  formatting,
  renderers,
  formatterToolbar,
  columnGroups,
  calculatedColumns,
  conditionalStyling,
  liveUpdates,
  profiles,
  alerts,
  quickFilters,
  smartEdit,
  editHistory,
  bulkUpdate,
  editing,
  plusMinus,
  shortcuts,
  visualExcel,
  stressTest,
} as const;
