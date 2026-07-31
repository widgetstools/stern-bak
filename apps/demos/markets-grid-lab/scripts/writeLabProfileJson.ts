/**
 * Writes gc-profile JSON for every lab demo catalog.
 *
 *   npx tsx apps/demos/markets-grid-lab/scripts/writeLabProfileJson.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALERTS_DEMO_PROFILES,
  ALERTS_GRID_ID,
  FORMATTER_TOOLBAR_DEMO_PROFILES,
  FORMATTER_TOOLBAR_GRID_ID,
  CALCULATED_DEMO_PROFILES,
  CALCULATED_GRID_ID,
  COLUMN_GROUPS_DEMO_PROFILES,
  COLUMN_GROUPS_GRID_ID,
  CONDITIONAL_DEMO_PROFILES,
  CONDITIONAL_GRID_ID,
  FORMATTING_DEMO_PROFILES,
  FORMATTING_GRID_ID,
  LIVE_DEMO_PROFILES,
  LIVE_GRID_ID,
  RENDERERS_DEMO_PROFILES,
  RENDERERS_GRID_ID,
  OVERVIEW_DEMO_PROFILES,
  OVERVIEW_GRID_ID,
  QUICK_FILTERS_DEMO_PROFILES,
  QUICK_FILTERS_GRID_ID,
  BULK_UPDATE_DEMO_PROFILES,
  BULK_UPDATE_GRID_ID,
  EDITING_DEMO_PROFILES,
  EDITING_GRID_ID,
  PLUS_MINUS_DEMO_PROFILES,
  PLUS_MINUS_GRID_ID,
  SHORTCUTS_DEMO_PROFILES,
  SHORTCUTS_GRID_ID,
  SMART_EDIT_GRID_ID,
  SMART_EDIT_DEMO_PROFILES,
  VISUAL_EXCEL_DEMO_PROFILES,
  VISUAL_EXCEL_GRID_ID,
} from '../src/profiles/catalogs';
import { toExportedProfilePayload } from '../src/profiles/labProfileKit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outRoot = join(__dirname, '../public/lab-profiles');

const CATALOGS = [
  { folder: 'overview', gridId: OVERVIEW_GRID_ID, profiles: OVERVIEW_DEMO_PROFILES },
  { folder: 'conditional-styling', gridId: CONDITIONAL_GRID_ID, profiles: CONDITIONAL_DEMO_PROFILES },
  { folder: 'calculated-columns', gridId: CALCULATED_GRID_ID, profiles: CALCULATED_DEMO_PROFILES },
  { folder: 'formatting', gridId: FORMATTING_GRID_ID, profiles: FORMATTING_DEMO_PROFILES },
  { folder: 'column-groups', gridId: COLUMN_GROUPS_GRID_ID, profiles: COLUMN_GROUPS_DEMO_PROFILES },
  { folder: 'live-updates', gridId: LIVE_GRID_ID, profiles: LIVE_DEMO_PROFILES },
  { folder: 'alerts', gridId: ALERTS_GRID_ID, profiles: ALERTS_DEMO_PROFILES },
  { folder: 'renderers', gridId: RENDERERS_GRID_ID, profiles: RENDERERS_DEMO_PROFILES },
  { folder: 'formatter-toolbar', gridId: FORMATTER_TOOLBAR_GRID_ID, profiles: FORMATTER_TOOLBAR_DEMO_PROFILES },
  { folder: 'quick-filters', gridId: QUICK_FILTERS_GRID_ID, profiles: QUICK_FILTERS_DEMO_PROFILES },
  { folder: 'smart-edit', gridId: SMART_EDIT_GRID_ID, profiles: SMART_EDIT_DEMO_PROFILES },
  { folder: 'bulk-update', gridId: BULK_UPDATE_GRID_ID, profiles: BULK_UPDATE_DEMO_PROFILES },
  { folder: 'plus-minus', gridId: PLUS_MINUS_GRID_ID, profiles: PLUS_MINUS_DEMO_PROFILES },
  { folder: 'shortcuts', gridId: SHORTCUTS_GRID_ID, profiles: SHORTCUTS_DEMO_PROFILES },
  { folder: 'editing', gridId: EDITING_GRID_ID, profiles: EDITING_DEMO_PROFILES },
  { folder: 'visual-excel', gridId: VISUAL_EXCEL_GRID_ID, profiles: VISUAL_EXCEL_DEMO_PROFILES },
] as const;

for (const { folder, gridId, profiles } of CATALOGS) {
  const dir = join(outRoot, folder);
  mkdirSync(dir, { recursive: true });
  for (const entry of profiles) {
    const payload = toExportedProfilePayload(entry, gridId);
    writeFileSync(join(dir, `${entry.id}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    console.log('wrote', join(folder, `${entry.id}.json`));
  }
}
