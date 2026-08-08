/** @deprecated Import from `./catalogs/alertsCatalog` — kept for older imports. */
export {
  ALERTS_GRID_ID as ALERT_DEMO_GRID_ID,
  ALERTS_DEMO_PROFILES as ALERT_DEMO_PROFILES,
  ALERTS_ACTIVE_PROFILE_ID as ALERT_DEMO_ACTIVE_PROFILE_ID,
} from './catalogs/alertsCatalog';

import { ALERTS_GRID_ID } from './catalogs/alertsCatalog';
import {
  toExportedProfilePayload as toPayload,
  type LabDemoProfileEntry,
} from './labProfileKit';

export type { LabDemoProfileEntry as AlertDemoProfileEntry } from './labProfileKit';

/** Alert profile export helper — binds the alerts grid id. */
export function toExportedProfilePayload(entry: LabDemoProfileEntry) {
  return toPayload(entry, ALERTS_GRID_ID);
}
