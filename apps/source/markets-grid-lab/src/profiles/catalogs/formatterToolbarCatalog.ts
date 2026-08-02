import type { LabDemoProfileEntry } from '../labProfileKit';
import {
  FORMATTER_TOOLBAR_BORDERS,
  FORMATTER_TOOLBAR_FULL_STATE,
  FORMATTER_TOOLBAR_HEADERS,
  FORMATTER_TOOLBAR_PNL,
  FORMATTER_TOOLBAR_TYPOGRAPHY,
} from '../../seeds/formatterToolbar';

export const FORMATTER_TOOLBAR_GRID_ID = 'lab-formatter-toolbar-v2';

export const FORMATTER_TOOLBAR_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'ft-00-painted-desk',
    name: '00 · Painted desk',
    blurb: 'Pre-styled IDs, pricing, P&L, headers — start here.',
    seed: { 'column-customization': FORMATTER_TOOLBAR_FULL_STATE },
  },
  {
    id: 'ft-01-typography',
    name: '01 · Typography',
    blurb: 'Bold ticker · italic description · underlined trader.',
    seed: { 'column-customization': { assignments: FORMATTER_TOOLBAR_TYPOGRAPHY } },
  },
  {
    id: 'ft-02-borders',
    name: '02 · Bid/ask borders',
    blurb: 'Bottom borders on bid · mid · ask.',
    seed: { 'column-customization': { assignments: FORMATTER_TOOLBAR_BORDERS } },
  },
  {
    id: 'ft-03-pnl-palette',
    name: '03 · P&L palette',
    blurb: 'Distinct paints on daily · unreal · MTD P&L.',
    seed: { 'column-customization': { assignments: FORMATTER_TOOLBAR_PNL } },
  },
  {
    id: 'ft-04-headers',
    name: '04 · Header row',
    blurb: 'CUSIP · rating · book header overrides.',
    seed: { 'column-customization': { assignments: FORMATTER_TOOLBAR_HEADERS } },
  },
  {
    id: 'ft-05-blank-canvas',
    name: '05 · Blank canvas',
    blurb: 'No overrides — paint with the floating toolbar.',
    seed: { 'column-customization': { assignments: {} } },
  },
];

export const FORMATTER_TOOLBAR_ACTIVE_PROFILE_ID = 'ft-00-painted-desk';
