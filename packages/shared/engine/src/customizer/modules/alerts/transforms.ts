/**
 * Placeholder no-op transforms for the alerts module.
 *
 * Alerts do not currently modify column definitions or grid options — they
 * observe AG-Grid events and dispatch notifications. This file exists so the
 * module shape stays consistent with the other customizer modules and gives
 * a stable seam for future visual indicators (e.g. "row currently in alert
 * state" highlight) without a second refactor.
 */

import type { AnyColDef, GridOptions } from '../../../platform/types';

export function applyAlertTransforms(defs: AnyColDef[]): AnyColDef[] {
  return defs;
}

export function applyAlertGridOptions(opts: Partial<GridOptions>): Partial<GridOptions> {
  return opts;
}
