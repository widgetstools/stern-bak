import type { LabDemoProfileEntry } from '../labProfileKit';
import {
  RENDERERS_CHARTS_ASSIGNMENTS,
  RENDERERS_FLAGS_ASSIGNMENTS,
  RENDERERS_FULL_STATE,
  RENDERERS_PILLS_ASSIGNMENTS,
  RENDERERS_PNL_ASSIGNMENTS,
} from '../../seeds/renderers';

export const RENDERERS_GRID_ID = 'lab-renderers-v2';

export const RENDERERS_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'render-00-full-showcase',
    name: '00 · Full showcase',
    blurb: 'Pills · heatmap · bars · spark · PnL · flags · time-since.',
    seed: { 'column-customization': RENDERERS_FULL_STATE },
  },
  {
    id: 'render-01-pills',
    name: '01 · Pills',
    blurb: 'Rating + sector exact-match pills.',
    seed: { 'column-customization': { assignments: RENDERERS_PILLS_ASSIGNMENTS } },
  },
  {
    id: 'render-02-charts',
    name: '02 · Charts & bars',
    blurb: 'Heatmap OAS · percent bars · KRD sparkline.',
    seed: { 'column-customization': { assignments: RENDERERS_CHARTS_ASSIGNMENTS } },
  },
  {
    id: 'render-03-pnl-motion',
    name: '03 · P&L & motion',
    blurb: 'Trend arrow · pnl-value · time-since.',
    seed: { 'column-customization': { assignments: RENDERERS_PNL_ASSIGNMENTS } },
  },
  {
    id: 'render-04-flags',
    name: '04 · Flags',
    blurb: 'Country + currency flag renderers.',
    seed: { 'column-customization': { assignments: RENDERERS_FLAGS_ASSIGNMENTS } },
  },
  {
    id: 'render-05-plain-text',
    name: '05 · Plain text',
    blurb: 'No renderers — baseline for Column Settings authoring.',
    seed: { 'column-customization': { assignments: {} } },
  },
];

export const RENDERERS_ACTIVE_PROFILE_ID = 'render-00-full-showcase';
