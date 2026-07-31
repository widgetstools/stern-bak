import type { LabDemoProfileEntry } from '../labProfileKit';
import { CONDITIONAL_TAB_CS_RULES, HEAVY_FLASH } from '../../seeds';

export const CONDITIONAL_GRID_ID = 'lab-conditional-v7';

const pick = (...ids: string[]) =>
  CONDITIONAL_TAB_CS_RULES.filter((r) => ids.includes(r.id));

export const CONDITIONAL_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'cs-00-full-curriculum',
    name: '00 · Full curriculum',
    blurb: 'All 13 tutorial rules — cell, row, flash, diff, indicators.',
    seed: { 'conditional-styling': { rules: CONDITIONAL_TAB_CS_RULES }, 'general-settings': HEAVY_FLASH },
  },
  {
    id: 'cs-01-flash-lab',
    name: '01 · Flash lab',
    blurb: 'One-shot, pulse, activeDurationMs, header targets.',
    seed: {
      'conditional-styling': {
        rules: pick('demo-flash-oneshot', 'demo-flash-pulse', 'demo-active-window', 'demo-diff-yield'),
      },
      'general-settings': HEAVY_FLASH,
    },
  },
  {
    id: 'cs-02-diff-old-new',
    name: '02 · Diff (.old/.new)',
    blurb: 'Directional mid ticks + big-move amber window.',
    seed: { 'conditional-styling': { rules: pick('demo-diff-up', 'demo-diff-down', 'demo-diff-big') } },
  },
  {
    id: 'cs-03-row-indicators',
    name: '03 · Row + indicators',
    blurb: 'Junk row tint, callable bell, wide-spread triangle.',
    seed: {
      'conditional-styling': {
        rules: pick('demo-row-rule', 'demo-indicator-tr', 'demo-indicator-bl', 'demo-headers-only'),
      },
    },
  },
  {
    id: 'cs-04-cell-paint',
    name: '04 · Cell paint only',
    blurb: 'Persistent emerald/rose backgrounds — no flash.',
    seed: {
      'conditional-styling': { rules: pick('demo-cell-color', 'demo-cell-color-loser') },
    },
  },
  {
    id: 'cs-05-all-disabled',
    name: '05 · Rules present (off)',
    blurb: 'Full rule list disabled — toggle on in Style Rules.',
    seed: {
      'conditional-styling': {
        rules: CONDITIONAL_TAB_CS_RULES.map((r) => ({ ...r, enabled: false })),
      },
    },
  },
];

export const CONDITIONAL_ACTIVE_PROFILE_ID = 'cs-00-full-curriculum';
