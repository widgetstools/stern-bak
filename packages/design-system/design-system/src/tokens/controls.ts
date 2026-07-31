// ─────────────────────────────────────────────────────────────
//  FI Design System — Control Density Tokens
//  Canonical metrics for compact controls used across editor
//  panels, toolbars, and inline pickers (stepper, pill toggle,
//  formatter trigger, swatch, popout-dialog button, etc.).
//
//  Every audited surface had its own improvised heights/paddings
//  (24/26/28/30 high, 8/10/12 paddingX, 6/8 gap). This module
//  collapses them onto a four-tier scale so refactors converge
//  on the same dimensions and inline px literals can be replaced
//  with `controls.sm.height` (TS) or `var(--ds-control-sm-height)`
//  (inline-style CSS).
//
//  Sizes derive from existing primitives — no novel scale.
// ─────────────────────────────────────────────────────────────

import { typography, radius, spacing } from './primitives';

export interface ControlTier {
  height:       string;  // outer box height
  paddingX:     string;  // inline padding
  gap:          string;  // child gap (icon ↔ label)
  fontSize:     string;
  iconSize:     string;  // canonical icon side length
  borderRadius: string;
}

// Four density tiers, sorted ascending by physical height.
//
// xs (24px) — pill chips, FlashBand action pills, micro accents.
// sm (26px) — editor steppers, pill toggles, compact picker triggers.
// md (28px) — search inputs, secondary editor controls.
// lg (30px) — primary toolbar / dialog buttons.
export const controls = {
  xs: {
    height:       '24px',
    paddingX:     `${spacing[2]}px`,    // 8
    gap:          `${spacing[1]}px`,    // 4
    fontSize:     typography.fontSize.sm,
    iconSize:     '12px',
    borderRadius: radius.sm,
  },
  sm: {
    height:       '26px',
    paddingX:     `${spacing[2.5]}px`,  // 10
    gap:          `${spacing[1.5]}px`,  // 6
    fontSize:     typography.fontSize.sm,
    iconSize:     '14px',
    borderRadius: radius.sm,
  },
  md: {
    height:       '28px',
    paddingX:     `${spacing[3]}px`,    // 12
    gap:          `${spacing[1.5]}px`,  // 6
    fontSize:     typography.fontSize.md,
    iconSize:     '14px',
    borderRadius: radius.sm,
  },
  lg: {
    height:       '30px',
    paddingX:     `${spacing[3]}px`,    // 12
    gap:          `${spacing[2]}px`,    // 8
    fontSize:     typography.fontSize.md,
    iconSize:     '16px',
    borderRadius: radius.sm,
  },
} as const satisfies Record<string, ControlTier>;

export type ControlSize = keyof typeof controls;
