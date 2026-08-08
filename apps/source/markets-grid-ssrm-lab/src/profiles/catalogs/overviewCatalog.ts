import type { LabDemoProfileEntry } from '../labProfileKit';
import { FORMATTING_ASSIGNMENTS } from '../../seeds/columnCustomization';
import {
  HEAVY_FLASH,
  OVERVIEW_CALC_COLUMNS,
  OVERVIEW_CC_STATE,
  OVERVIEW_COLUMN_GROUPS,
  OVERVIEW_CS_RULES,
} from '../../seeds';

export const OVERVIEW_GRID_ID = 'lab-overview-v7';

const FULL: LabDemoProfileEntry['seed'] = {
  'conditional-styling': { rules: OVERVIEW_CS_RULES },
  'column-customization': OVERVIEW_CC_STATE,
  'column-groups': { groups: OVERVIEW_COLUMN_GROUPS, openGroupIds: { g_pricing: true, g_pnl: true } },
  'calculated-columns': { virtualColumns: OVERVIEW_CALC_COLUMNS },
  'general-settings': HEAVY_FLASH,
};

export const OVERVIEW_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'ov-00-kitchen-sink',
    name: '00 · Kitchen sink',
    blurb: 'All modules seeded — rules, calc cols, groups, formatters, flash.',
    seed: FULL,
  },
  {
    id: 'ov-01-trader-pnl',
    name: '01 · Trader P&L',
    blurb: 'Winners/losers + price tick flash; pricing formatters only.',
    seed: {
      'conditional-styling': {
        rules: OVERVIEW_CS_RULES.filter((r) =>
          ['losers', 'winners', 'price-changed'].includes(r.id),
        ),
      },
      'column-customization': {
        assignments: {
          bidPrice: OVERVIEW_CC_STATE.assignments.bidPrice,
          midPrice: OVERVIEW_CC_STATE.assignments.midPrice,
          askPrice: OVERVIEW_CC_STATE.assignments.askPrice,
          unrealizedPnL: OVERVIEW_CC_STATE.assignments.unrealizedPnL,
          dailyPnL: OVERVIEW_CC_STATE.assignments.dailyPnL,
        },
      },
      'general-settings': HEAVY_FLASH,
    },
  },
  {
    id: 'ov-02-risk-desk',
    name: '02 · Risk desk',
    blurb: 'Duration, OAS, junk rows + risk calc columns.',
    seed: {
      'conditional-styling': {
        rules: OVERVIEW_CS_RULES.filter((r) =>
          ['high-yield-watch', 'wide-spread', 'junk-rating', 'wide-spread-expr'].includes(r.id),
        ),
      },
      'calculated-columns': {
        virtualColumns: OVERVIEW_CALC_COLUMNS.filter((c) =>
          ['calc_carryRisk', 'calc_dollarDur', 'calc_cs01Notional'].includes(c.colId),
        ),
      },
      'column-customization': {
        assignments: {
          yieldToMaturity: OVERVIEW_CC_STATE.assignments.yieldToMaturity,
          yieldToWorst: OVERVIEW_CC_STATE.assignments.yieldToWorst,
          oas: OVERVIEW_CC_STATE.assignments.oas,
          modifiedDuration: FORMATTING_ASSIGNMENTS.modifiedDuration,
        },
      },
    },
  },
  {
    id: 'ov-03-groups-collapsed',
    name: '03 · Groups collapsed',
    blurb: 'Full group tree; every group starts closed.',
    seed: {
      'column-groups': { groups: OVERVIEW_COLUMN_GROUPS, openGroupIds: {} },
      'column-customization': OVERVIEW_CC_STATE,
    },
  },
  {
    id: 'ov-04-calc-heavy',
    name: '04 · Calculated heavy',
    blurb: 'All virtual columns + P&L colouring on derived total.',
    seed: {
      'calculated-columns': { virtualColumns: OVERVIEW_CALC_COLUMNS },
      'conditional-styling': {
        rules: OVERVIEW_CS_RULES.filter((r) => ['losers', 'winners'].includes(r.id)),
      },
    },
  },
  {
    id: 'ov-05-minimal',
    name: '05 · Minimal',
    blurb: 'No module overrides — baseline grid only.',
    seed: {},
  },
];

export const OVERVIEW_ACTIVE_PROFILE_ID = 'ov-00-kitchen-sink';
