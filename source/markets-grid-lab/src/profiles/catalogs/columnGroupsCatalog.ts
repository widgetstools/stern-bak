import type { LabDemoProfileEntry } from '../labProfileKit';
import { OVERVIEW_COLUMN_GROUPS } from '../../seeds';

export const COLUMN_GROUPS_GRID_ID = 'lab-column-groups-v5';

export const COLUMN_GROUPS_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'cg-00-pricing-pnl-open',
    name: '00 · Pricing + P&L open',
    blurb: 'Default demo — pricing and P&L groups expanded.',
    seed: {
      'column-groups': {
        groups: OVERVIEW_COLUMN_GROUPS,
        openGroupIds: { g_pricing: true, g_pnl: true },
      },
    },
  },
  {
    id: 'cg-01-all-collapsed',
    name: '01 · All collapsed',
    blurb: 'Eight groups; click chevrons to reveal open-only children.',
    seed: { 'column-groups': { groups: OVERVIEW_COLUMN_GROUPS, openGroupIds: {} } },
  },
  {
    id: 'cg-02-identifier-pricing',
    name: '02 · ID + pricing open',
    blurb: 'Identifier (marryChildren) + pricing visible.',
    seed: {
      'column-groups': {
        groups: OVERVIEW_COLUMN_GROUPS,
        openGroupIds: { g_identifier: true, g_pricing: true },
      },
    },
  },
  {
    id: 'cg-03-risk-yields',
    name: '03 · Risk + yields open',
    blurb: 'Research lens — yields, risk, quantities expanded.',
    seed: {
      'column-groups': {
        groups: OVERVIEW_COLUMN_GROUPS,
        openGroupIds: { g_yields: true, g_risk: true, g_quantities: true },
      },
    },
  },
  {
    id: 'cg-04-status-book',
    name: '04 · Status + book',
    blurb: 'Status/book group open; everything else closed.',
    seed: {
      'column-groups': {
        groups: OVERVIEW_COLUMN_GROUPS,
        openGroupIds: { g_status: true },
      },
    },
  },
];

export const COLUMN_GROUPS_ACTIVE_PROFILE_ID = 'cg-00-pricing-pnl-open';
