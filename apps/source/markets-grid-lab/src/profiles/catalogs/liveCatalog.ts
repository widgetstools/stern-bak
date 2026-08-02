import type { LabDemoProfileEntry } from '../labProfileKit';
import { FAST_FLASH, HEAVY_FLASH, LIVE_TAB_CS_RULES, STORM_FLASH } from '../../seeds';

export const LIVE_GRID_ID = 'lab-live-v6';

const pick = (...ids: string[]) => LIVE_TAB_CS_RULES.filter((r) => ids.includes(r.id));

export const LIVE_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'live-00-storm',
    name: '00 · Flash storm',
    blurb: 'All four rules + fast native flash (350 ms).',
    seed: {
      'conditional-styling': { rules: LIVE_TAB_CS_RULES },
      'general-settings': STORM_FLASH,
    },
  },
  {
    id: 'live-01-tick-only',
    name: '01 · Price tick only',
    blurb: 'Sky one-shot on every price column change.',
    seed: {
      'conditional-styling': { rules: pick('live-tick-flash') },
      'general-settings': FAST_FLASH,
    },
  },
  {
    id: 'live-02-pnl-sign',
    name: '02 · P&L sign flash',
    blurb: 'Winners emerald / losers rose with indicators.',
    seed: {
      'conditional-styling': { rules: pick('live-winners', 'live-losers') },
      'general-settings': FAST_FLASH,
    },
  },
  {
    id: 'live-03-big-tick',
    name: '03 · Big mid moves',
    blurb: 'Diff rule for |Δ| > 0.08 with amber header flash.',
    seed: {
      'conditional-styling': { rules: pick('live-big-tick') },
      'general-settings': HEAVY_FLASH,
    },
  },
];

export const LIVE_ACTIVE_PROFILE_ID = 'live-00-storm';
