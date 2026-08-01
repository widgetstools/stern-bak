/**
 * Conditional Styling — a list of expression-driven rules that paint cells
 * (scoped to specific columns) or whole rows. Carried into AG-Grid via
 * `ColDef.cellClassRules` / `GridOptions.rowClassRules`. The actual visual
 * styling is delivered through CSS classes (`ds-rule-<id>`) injected at
 * mount time, NOT inline styles — keeps re-render cheap and lets the dark
 * theme switch via `:root.dark` selectors without recomputing rules.
 *
 * `CellStyleProperties` / `ThemeAwareStyle` / `ConditionalRule` are
 * re-exported from `@wellsfargo-starui/core` so on-disk profile
 * snapshots from prior schema versions load cleanly without an
 * intermediate migration step.
 */
// Relative on purpose — package self-imports create a barrel cycle.
export type {
  CellStyleProperties,
  ThemeAwareStyle,
} from '../../../types/common';

import type { ThemeAwareStyle } from '../../../types/common';
import type { ValueFormatterTemplate } from '../../../colDef';

/** A cell-scoped rule applies to specific column ids. A row-scoped rule
 *  paints the whole row when the expression is truthy. */
export type RuleScope = { type: 'cell'; columns: string[] } | { type: 'row' };

/**
 * Optional "flash on match" config for a rule.
 *
 * Implementation note: this is a **CSS-keyframes** flash rendered through
 * the rule's own injected class — NOT AG-Grid's native `api.flashCells()`.
 * That choice is deliberate (see `transforms.ts`):
 *   - lets us paint header surfaces (AG-Grid has no `headerClassRules`);
 *   - gives each rule its own colour + timing instead of one global theme
 *     param;
 *   - composes naturally with `activeDurationMs` (class drop = animation
 *     stop, no double-timer coordination);
 *   - zero per-cell JS cost — the GPU drives the animation.
 *
 * Each rule emits its own animation name (`ds-flash-<ruleId>`) and its
 * own scoped `--ds-flash-color` variable, so two flashing rules on the
 * same cell stay visually independent. When more than one flash rule
 * matches, the higher-priority rule wins the cascade (predictable, not a
 * blended chaos).
 *
 * `target` is constrained by the rule's `scope`:
 *   - `scope.type === 'row'`   → only `'row'` makes sense.
 *   - `scope.type === 'cell'`  → `'cells'`, `'headers'`, or `'cells+headers'`.
 *
 * The runtime validates the combination defensively (defaults to the
 * scope-appropriate choice when a legacy/invalid value is loaded).
 */
export type FlashTarget = 'row' | 'cells' | 'headers' | 'cells+headers';

/**
 * How the flash plays:
 *   - `oneShot` — single fade-in / fade-out on match. Default. Maps to the
 *     intuitive "blink when value changes" UX.
 *   - `pulse`   — continuous in/out pulse for as long as the rule matches.
 *     Useful for "currently in alarm state" indicators. Loud at scale —
 *     use sparingly.
 */
export type FlashMode = 'oneShot' | 'pulse';

/**
 * Named colour for the flash overlay. Each option ships matched
 * light/dark CSS values (see `FLASH_PALETTE` in `transforms.ts`) so the
 * pulse stays visible under both themes without per-rule colour tuning.
 *
 * Eight options chosen to span the trading-UI semantic spectrum
 * (positive / negative / warning / info / neutral) plus aesthetic variety
 * for cases where the rule's colour is just a visual ID, not a meaning.
 */
export type FlashColor =
  | 'amber'    // default — warm yellow, neutral attention
  | 'emerald'  // positive / gain
  | 'rose'     // negative / loss / alert
  | 'sky'      // info / neutral notification
  | 'violet'   // tag colour, no semantic
  | 'teal'     // secondary positive / cool
  | 'orange'   // secondary warning
  | 'slate';   // muted / "noted" without alarm

export interface FlashConfig {
  enabled: boolean;
  target: FlashTarget;
  /** How the flash plays. Default `'oneShot'`. */
  mode?: FlashMode;
  /**
   * Named palette colour. Default `'amber'`. Resolves to a theme-aware
   * CSS variable internally, so the same value works under light and
   * dark themes.
   */
  color?: FlashColor;
  /**
   * Single duration in ms covering the full animation cycle
   * (oneShot: in→hold→out; pulse: one full pulse iteration).
   * Default 700.
   */
  durationMs?: number;
}

/**
 * Which surface(s) the indicator badge paints on when the rule
 * matches. Cells = the matching data cells; headers = the column
 * header(s) owning those cells.
 */
export type IndicatorTarget = 'cells' | 'headers' | 'cells+headers';

/** Anchor position of the badge on the cell / header surface. */
export type IndicatorPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'left-middle'
  | 'right-middle';

/**
 * Optional badge drawn on every cell and/or header that currently
 * matches the rule. Rendered via a CSS `::before` pseudo-element so
 * there's no per-cell React work and no conflict with AG-Grid's
 * default cell renderer recycling.
 */
export interface RuleIndicator {
  /** Key from `INDICATOR_ICONS` (see `./indicatorIcons.ts`). When the
   *  key is unknown (legacy data, renamed icon), the runtime silently
   *  renders no badge — it does NOT fall back to a default so the UX
   *  stays predictable. */
  icon: string;
  /** CSS colour string. Defaults to `currentColor` (inherits from the
   *  cell's text colour) when omitted. */
  color?: string;
  /** Where to paint. Default `cells+headers` — matches the zero-config
   *  behaviour that shipped first. */
  target?: IndicatorTarget;
  /** Badge anchor position. Default `top-right`. */
  position?: IndicatorPosition;
}

/**
 * How a matching cell's *value glyph* animates. Distinct from
 * {@link FlashConfig}, which pulses the whole cell/row surface: animation
 * targets the `.ag-cell-value` element so only the rendered value — typically
 * an emoji / icon supplied by the column's value format — moves.
 *
 *   - `spin`         — continuous clockwise rotation. The "in progress"
 *                      spinner pattern: pair with an Excel value format that
 *                      maps the in-progress value to a 🔄 / ⏳ glyph
 *                      (`[=1]"🔄";[=2]"✅"`) and a rule `value = 1`.
 *   - `spin-reverse` — continuous counter-clockwise rotation.
 *   - `pulse`        — scale + opacity throb, no rotation (a "breathing"
 *                      attention cue for glyphs that don't read as spinning).
 */
export type AnimationKind = 'spin' | 'spin-reverse' | 'pulse';

export interface AnimationConfig {
  enabled: boolean;
  /** Animation style. Default `'spin'`. */
  kind?: AnimationKind;
  /**
   * One full iteration in ms (lower = faster). Default 1000.
   */
  durationMs?: number;
}

export interface ConditionalRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Lower runs first within the conditional-styling pipeline. */
  priority: number;
  scope: RuleScope;
  /** Free-form expression evaluated against `{ value, x, data, columns }`. */
  expression: string;
  style: ThemeAwareStyle;
  /** Optional visible flash when this rule matches a cell/row/header.
   *  Pure CSS-keyframes implementation — see `FlashConfig` for the why. */
  flash?: FlashConfig;
  /** Optional badge drawn on every matching cell + header. */
  indicator?: RuleIndicator;
  /**
   * Optional motion applied to the matching cell's value glyph — e.g. a
   * spinning 🔄 for an "in progress" state. Pure CSS-keyframes (zero
   * per-cell JS), scoped to `.ag-cell-value` so only the value animates,
   * not the cell surface. Only meaningful for cell-scope rules.
   */
  animation?: AnimationConfig;
  /**
   * Optional per-rule value formatter. Applies to cells matching the
   * rule in the rule's target column(s). Only meaningful when the rule
   * is cell-scope (row-scope rules don't have a column to carry a
   * formatter). When a cell matches multiple rules with formatters,
   * the highest-priority rule's formatter wins.
   *
   * Same `ValueFormatterTemplate` shape that `column-customization`
   * uses — every format the toolbar / calculated-column editor can
   * author is valid here too (presets, excelFormat, expression, tick).
   */
  valueFormatter?: ValueFormatterTemplate;
  /**
   * Optional "style active window" in milliseconds.
   *
   * When set (> 0), the rule's style is applied for this duration after a
   * value-change event causes the rule to match, then it reverts to the
   * default style automatically.
   *
   * Unset / <= 0 keeps the existing persistent expression-driven behaviour.
   */
  activeDurationMs?: number;
}

export interface ConditionalStylingState {
  rules: ConditionalRule[];
}

export const INITIAL_CONDITIONAL_STYLING: ConditionalStylingState = { rules: [] };
