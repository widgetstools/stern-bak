/**
 * Conditional-styling transforms — CSS generation + class-rule predicate
 * builders. Pure-data helpers split out of the module entry so the runtime
 * wiring in `index.ts` stays compact.
 */
import type {
  CellClassParams,
  ColDef,
  ColGroupDef,
  RowClassParams,
  ValueFormatterParams,
} from 'ag-grid-community';
// Relative on purpose — package self-imports create a barrel cycle.
import type {
  AnyColDef,
  CssHandle,
  ExpressionEngineLike,
} from '../../../platform/types';
import type { ExpressionNode } from '../../../expression/types';
import { valueFormatterFromTemplate } from '../../../colDef';
import { getValueByPath } from '@wellsfargo-starui/types';
import { cssEscapeColId } from '../column-customization/transforms';
import type {
  AnimationKind,
  CellStyleProperties,
  ConditionalRule,
  FlashColor,
  FlashMode,
  FlashTarget,
  RuleIndicator,
} from './state';
import { findIndicatorIcon, iconAsDataUrl } from './indicatorIcons';

export interface CellDiffEntry {
  oldValue: unknown;
  newValue: unknown;
}

export type RowDiffMap = Map<string, CellDiffEntry>;
export type RowDiffCache = WeakMap<object, RowDiffMap>;
export type DiffCacheByApi = WeakMap<object, RowDiffCache>;
export type TimedRuleStateByRule = Map<string, { rowUntil?: number; cellsUntil: Map<string, number> }>;
export type TimedRuleStateByRowId = Map<string, TimedRuleStateByRule>;
export type TimedRuleStateByApi = WeakMap<object, TimedRuleStateByRowId>;

export const CONDITIONAL_DIFF_CACHE_KEY = 'conditional-styling:cell-diff-cache';
export const CONDITIONAL_TIMED_RULE_CACHE_KEY = 'conditional-styling:timed-rule-cache';
const TRACE_PREFIX = '[conditional-styling:timed]';

/**
 * Per-grid timed-activation store. The runtime creates ONE per
 * `activate()` and registers its `byRowId` map into the per-grid
 * `TimedRuleStateByApi` resource cache (keyed by the GridApi) so the
 * class-rule predicates can find it.
 *
 * This state used to be MODULE-SCOPED — one map shared by every grid in
 * the renderer. With multiple grids showing the same provider (same row
 * ids) and the same profile (same rule ids), any grid's activate()/
 * teardown `clear()` wiped every other grid's activations, and one
 * grid's prune (driven by ITS filter's visible-row set) deleted rows
 * still active in another grid.
 */
export interface TimedRuleStore {
  /** Row-id-keyed state — register into a `TimedRuleStateByApi` map. */
  readonly byRowId: TimedRuleStateByRowId;
  clear(): void;
  upsertRowActivation(rowId: string, ruleId: string, until: number): void;
  upsertCellActivation(rowId: string, ruleId: string, colId: string, until: number): void;
  /**
   * Earliest pending expiry timestamp (ms since epoch) across all timed
   * activations, or `null` when nothing is active. Used by the coalesced
   * expiry scheduler to arm a single timer for the nearest activation —
   * keeps timer churn O(1) regardless of tick rate.
   */
  getNextExpiry(): number | null;
  prune(activeRowIds: Set<string>): void;
  /** Drop entries whose rule no longer exists (profile switch). */
  pruneByRuleSet(activeTimedRuleIds: Set<string>): void;
  /**
   * Collect the (rowId, colIds) pairs whose entries are expired, then
   * drop those entries — the expiry timer computes the targeted refresh
   * surface AND clears state in one pass.
   */
  collectAndPruneExpired(): {
    rowScope: Array<{ rowId: string }>;
    cellScope: Array<{ rowId: string; colIds: string[] }>;
  };
}

export function createTimedRuleStore(): TimedRuleStore {
  const byRowId: TimedRuleStateByRowId = new Map();

  // Cached earliest pending expiry across the whole map. `null` means "no
  // entries pending"; `undefined` means "stale — recompute on next read".
  // Updated incrementally on insert (cheap O(1) min-check) and invalidated
  // wholesale on any prune (recomputed lazily via a single map walk when
  // `getNextExpiry` is next called). Keeps `armNextExpiry` O(1) in
  // the hot insert path and bounds the walk to once per prune burst.
  let cachedNextExpiry: number | null | undefined = null;

  const noteExpiryInserted = (at: number): void => {
    if (cachedNextExpiry === undefined) return; // already stale
    if (cachedNextExpiry === null || at < cachedNextExpiry) {
      cachedNextExpiry = at;
    }
  };

  const invalidateExpiryCache = (): void => {
    cachedNextExpiry = undefined;
  };

  const clear = (): void => {
    byRowId.clear();
    cachedNextExpiry = null;
  };

  const upsertRowActivation = (rowId: string, ruleId: string, until: number): void => {
    let byRule = byRowId.get(rowId);
    if (!byRule) {
      byRule = new Map<string, { rowUntil?: number; cellsUntil: Map<string, number> }>();
      byRowId.set(rowId, byRule);
    }
    const prev = byRule.get(ruleId);
    if (!prev) {
      byRule.set(ruleId, { rowUntil: until, cellsUntil: new Map() });
      noteExpiryInserted(until);
      if (isTraceOn()) traceTimed('upsertTimedRowRule:new', { rowId, ruleId, until });
      return;
    }
    prev.rowUntil = Math.max(prev.rowUntil ?? 0, until);
    noteExpiryInserted(prev.rowUntil);
    if (isTraceOn()) traceTimed('upsertTimedRowRule:update', { rowId, ruleId, until: prev.rowUntil });
  };

  const upsertCellActivation = (rowId: string, ruleId: string, colId: string, until: number): void => {
    let byRule = byRowId.get(rowId);
    if (!byRule) {
      byRule = new Map<string, { rowUntil?: number; cellsUntil: Map<string, number> }>();
      byRowId.set(rowId, byRule);
    }
    const prev = byRule.get(ruleId);
    if (!prev) {
      byRule.set(ruleId, { cellsUntil: new Map([[colId, until]]) });
      noteExpiryInserted(until);
      if (isTraceOn()) traceTimed('upsertTimedCellRule:new', { rowId, ruleId, colId, until });
      return;
    }
    prev.cellsUntil.set(colId, Math.max(prev.cellsUntil.get(colId) ?? 0, until));
    noteExpiryInserted(prev.cellsUntil.get(colId) ?? until);
    if (isTraceOn()) {
      traceTimed('upsertTimedCellRule:update', {
        rowId,
        ruleId,
        colId,
        until: prev.cellsUntil.get(colId),
      });
    }
  };

  const getNextExpiry = (): number | null => {
    // Fast path — cache valid → O(1).
    if (cachedNextExpiry !== undefined) return cachedNextExpiry;
    // Cold path — recompute by walking the map once.
    let next: number | null = null;
    for (const byRule of byRowId.values()) {
      for (const entry of byRule.values()) {
        if (entry.rowUntil != null && (next == null || entry.rowUntil < next)) {
          next = entry.rowUntil;
        }
        for (const expiry of entry.cellsUntil.values()) {
          if (next == null || expiry < next) next = expiry;
        }
      }
    }
    cachedNextExpiry = next;
    return next;
  };

  const prune = (activeRowIds: Set<string>): void => {
    const now = Date.now();
    let mutated = false;
    for (const [rowId, byRule] of byRowId) {
      if (!activeRowIds.has(rowId)) {
        byRowId.delete(rowId);
        mutated = true;
        continue;
      }
      for (const [ruleId, entry] of byRule) {
        if (entry.rowUntil != null && entry.rowUntil <= now) {
          entry.rowUntil = undefined;
          mutated = true;
        }
        for (const [colId, expiry] of entry.cellsUntil) {
          if (expiry <= now) {
            entry.cellsUntil.delete(colId);
            mutated = true;
          }
        }
        if (!entry.rowUntil && entry.cellsUntil.size === 0) {
          byRule.delete(ruleId);
          mutated = true;
        }
      }
      if (byRule.size === 0) {
        byRowId.delete(rowId);
        mutated = true;
      }
    }
    if (mutated) invalidateExpiryCache();
  };

  // Drop timed-state entries whose rule no longer exists in the active
  // set (e.g. after a profile load that removes / replaces the prior
  // profile's rules). Without this, stale entries from the previous
  // profile keep `getNextExpiry()` returning a non-null timestamp, the
  // coalesced expiry timer arms with delay 0/8 ms, fires, re-evaluates
  // against an empty rule set, and re-arms forever — visible in the
  // console as a tight `armNextExpiry` / `expiry refresh fired` loop.
  const pruneByRuleSet = (activeTimedRuleIds: Set<string>): void => {
    let mutated = false;
    for (const [rowId, byRule] of byRowId) {
      for (const ruleId of byRule.keys()) {
        if (!activeTimedRuleIds.has(ruleId)) {
          byRule.delete(ruleId);
          mutated = true;
        }
      }
      if (byRule.size === 0) {
        byRowId.delete(rowId);
        mutated = true;
      }
    }
    if (mutated) invalidateExpiryCache();
  };

  // `rowScope` carries entries that had `rowUntil` set (row-scope rules);
  // the caller refreshes the entire row's currently visible cells.
  // `cellScope` carries entries that had `cellsUntil` set (cell-scope
  // rules); the caller refreshes the precise (rowId, colId) pairs.
  const collectAndPruneExpired = (): {
    rowScope: Array<{ rowId: string }>;
    cellScope: Array<{ rowId: string; colIds: string[] }>;
  } => {
    const now = Date.now();
    const rowScope: Array<{ rowId: string }> = [];
    const cellScope: Array<{ rowId: string; colIds: string[] }> = [];
    let mutated = false;

    for (const [rowId, byRule] of byRowId) {
      let rowExpiredForThisRow = false;
      const cellColsExpiredForThisRow = new Set<string>();

      for (const [ruleId, entry] of byRule) {
        if (entry.rowUntil != null && entry.rowUntil <= now) {
          rowExpiredForThisRow = true;
          entry.rowUntil = undefined;
          mutated = true;
        }
        for (const [colId, expiry] of entry.cellsUntil) {
          if (expiry <= now) {
            cellColsExpiredForThisRow.add(colId);
            entry.cellsUntil.delete(colId);
            mutated = true;
          }
        }
        if (!entry.rowUntil && entry.cellsUntil.size === 0) {
          byRule.delete(ruleId);
          mutated = true;
        }
      }

      if (rowExpiredForThisRow) rowScope.push({ rowId });
      if (cellColsExpiredForThisRow.size > 0) {
        cellScope.push({ rowId, colIds: [...cellColsExpiredForThisRow] });
      }
      if (byRule.size === 0) {
        byRowId.delete(rowId);
        mutated = true;
      }
    }
    if (mutated) invalidateExpiryCache();
    return { rowScope, cellScope };
  };

  return {
    byRowId,
    clear,
    upsertRowActivation,
    upsertCellActivation,
    getNextExpiry,
    prune,
    pruneByRuleSet,
    collectAndPruneExpired,
  };
}

// ─── Flash palette + base keyframes (module-scoped, shipped once per grid) ─

/**
 * Flash colour palette. Each entry ships a tuned alpha for both themes
 * so the same named colour stays readable under light AND dark without
 * per-rule colour math. Alphas were picked to leave cell text legible.
 *
 * Adding a new colour: append it to the {@link FlashColor} union, add the
 * tuple here, and the editor's colour swatches pick it up automatically.
 */
export const FLASH_PALETTE: Record<FlashColor, { light: string; dark: string; swatch: string }> = {
  amber:   { light: 'rgba(251, 191, 36, 0.42)',  dark: 'rgba(251, 191, 36, 0.32)',  swatch: '#fbbf24' },
  emerald: { light: 'rgba(16, 185, 129, 0.38)',  dark: 'rgba(16, 185, 129, 0.32)',  swatch: '#10b981' },
  rose:    { light: 'rgba(244, 63, 94, 0.38)',   dark: 'rgba(244, 63, 94, 0.34)',   swatch: '#f43f5e' },
  sky:     { light: 'rgba(14, 165, 233, 0.38)',  dark: 'rgba(56, 189, 248, 0.32)',  swatch: '#0ea5e9' },
  violet:  { light: 'rgba(139, 92, 246, 0.36)',  dark: 'rgba(167, 139, 250, 0.32)', swatch: '#8b5cf6' },
  teal:    { light: 'rgba(20, 184, 166, 0.38)',  dark: 'rgba(45, 212, 191, 0.30)',  swatch: '#14b8a6' },
  orange:  { light: 'rgba(249, 115, 22, 0.40)',  dark: 'rgba(251, 146, 60, 0.32)',  swatch: '#f97316' },
  slate:   { light: 'rgba(100, 116, 139, 0.38)', dark: 'rgba(148, 163, 184, 0.30)', swatch: '#64748b' },
};

const DEFAULT_FLASH_COLOR: FlashColor = 'amber';
const DEFAULT_FLASH_MODE: FlashMode = 'oneShot';
const DEFAULT_FLASH_DURATION_MS = 700;

/**
 * Palette CSS rule — emits one `--ds-flash-<color>` variable per palette
 * entry, branched on theme. Per-rule classes resolve their colour by
 * referencing the variable instead of baking the RGBA in, so a global
 * palette tweak takes effect without re-emitting per-rule classes.
 */
const FLASH_PALETTE_RULE_ID = '__flash-palette__';
function buildFlashPaletteCss(): string {
  const lightVars = Object.entries(FLASH_PALETTE)
    .map(([name, c]) => `--ds-flash-${name}: ${c.light};`)
    .join(' ');
  const darkVars = Object.entries(FLASH_PALETTE)
    .map(([name, c]) => `--ds-flash-${name}: ${c.dark};`)
    .join(' ');
  return `
:root:not(.dark):not([data-theme="dark"]) { ${lightVars} }
.dark, [data-theme="dark"] { ${darkVars} }
`;
}
const FLASH_PALETTE_CSS = buildFlashPaletteCss();

/**
 * Per-rule animation keyframes. We mint a unique animation NAME per rule
 * (`ds-flash-<safeRuleId>`) so two flashing rules on the same cell don't
 * collide on the `animation` shorthand property — each gets its own
 * `--ds-flash-color` reference baked into a private keyframes block.
 *
 * Both modes share the same keyframes shape (in → hold → out); pulse
 * mode just repeats it. This keeps the generated CSS small and means a
 * mode flip is a one-property change.
 */
function buildFlashKeyframesCss(safeRuleId: string): string {
  const kf = `ds-flash-${safeRuleId}`;
  return `
@keyframes ${kf} {
  0%   { box-shadow: inset 0 0 0 9999px transparent; }
  25%  { box-shadow: inset 0 0 0 9999px var(--ds-flash-color); }
  75%  { box-shadow: inset 0 0 0 9999px var(--ds-flash-color); }
  100% { box-shadow: inset 0 0 0 9999px transparent; }
}
`;
}

// ─── Value-glyph animation (spin / pulse) ───────────────────────────────────

const DEFAULT_ANIMATION_KIND: AnimationKind = 'spin';
const DEFAULT_ANIMATION_DURATION_MS = 1000;

/** Keyframe name per animation kind. */
const ANIMATION_KEYFRAME_NAME: Record<AnimationKind, string> = {
  spin: 'ds-anim-spin',
  'spin-reverse': 'ds-anim-spin-reverse',
  pulse: 'ds-anim-pulse',
};

/**
 * Value-glyph animation keyframes. Unlike the per-rule flash keyframes
 * (which bake in a `--ds-flash-color` reference), these are value-agnostic
 * transforms, so they ship ONCE per grid (like the flash palette) and every
 * animating rule references one by name — no per-rule keyframe duplication.
 *
 * `spin` drives the "in progress" spinner: an Excel value format maps the
 * in-progress value to a 🔄 / ⏳ glyph and a `value = N` rule spins it.
 */
const ANIMATION_KEYFRAMES_RULE_ID = '__value-animation-keyframes__';
const ANIMATION_KEYFRAMES_CSS = `
@keyframes ds-anim-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes ds-anim-spin-reverse { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
@keyframes ds-anim-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.18); opacity: 0.6; } }
`;

// ─── CSS generation ────────────────────────────────────────────────────────

function styleToCSS(style: CellStyleProperties): string {
  const parts: string[] = [];
  if (style.backgroundColor) parts.push(`background-color: ${style.backgroundColor}`);
  if (style.color) parts.push(`color: ${style.color}`);
  if (style.fontWeight) parts.push(`font-weight: ${style.fontWeight}`);
  if (style.fontStyle) parts.push(`font-style: ${style.fontStyle}`);
  if (style.fontSize) parts.push(`font-size: ${style.fontSize}`);
  if (style.fontFamily) parts.push(`font-family: ${style.fontFamily}`);
  if (style.textAlign) parts.push(`text-align: ${style.textAlign}`);
  if (style.textDecoration) parts.push(`text-decoration: ${style.textDecoration}`);
  if (style.paddingTop) parts.push(`padding-top: ${style.paddingTop}`);
  if (style.paddingRight) parts.push(`padding-right: ${style.paddingRight}`);
  if (style.paddingBottom) parts.push(`padding-bottom: ${style.paddingBottom}`);
  if (style.paddingLeft) parts.push(`padding-left: ${style.paddingLeft}`);
  return parts.join('; ');
}

/**
 * Per-side borders rendered on a `::after` pseudo-element using real
 * CSS border properties (NOT `inset box-shadow`, which silently drops
 * the `style` so dashed / dotted never render). DO NOT emit
 * `position: relative` on the target — caused a header-layout
 * regression historically.
 */
function borderOverlayCSS(selector: string, style: CellStyleProperties): string {
  const parts: string[] = [];
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const width = style[`border${side}Width` as keyof CellStyleProperties] as string | undefined;
    const color = (style[`border${side}Color` as keyof CellStyleProperties] as string | undefined) ?? 'currentColor';
    const styleName = (style[`border${side}Style` as keyof CellStyleProperties] as string | undefined) ?? 'solid';
    if (width && width !== '0px' && width !== 'none') {
      parts.push(`border-${side.toLowerCase()}: ${width} ${styleName} ${color}`);
    }
  }
  if (parts.length === 0) return '';
  return `${selector}::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-sizing: border-box; z-index: 1; ${parts.join('; ')}; }`;
}

function indicatorOverlayCSS(
  ruleCls: string,
  indicator: RuleIndicator | undefined,
  scopeType: 'cell' | 'row',
): string {
  if (!indicator) return '';
  const def = findIndicatorIcon(indicator.icon);
  if (!def) return '';
  const color = indicator.color || 'currentColor';
  const url = iconAsDataUrl(def, color);

  const target = indicator.target ?? 'cells+headers';
  const selectors = scopeType === 'row'
    ? [`.ag-row${ruleCls} .ag-cell`]
    : target === 'cells' ? [`.ag-cell${ruleCls}`]
    : target === 'headers' ? [`.ag-header-cell${ruleCls}`]
    : [`.ag-cell${ruleCls}`, `.ag-header-cell${ruleCls}`];

  const pos = indicator.position ?? 'top-right';
  let anchor = 'top: 2px; right: 2px;';
  if (pos === 'top-left') anchor = 'top: 2px; left: 2px;';
  else if (pos === 'bottom-left') anchor = 'bottom: 2px; left: 2px;';
  else if (pos === 'bottom-right') anchor = 'bottom: 2px; right: 2px;';
  else if (pos === 'left-middle') anchor = 'top: 50%; left: 2px; transform: translateY(-50%);';
  else if (pos === 'right-middle') anchor = 'top: 50%; right: 2px; transform: translateY(-50%);';

  return `${selectors.map((selector) => `${selector}::before`).join(', ')} {
    content: ''; position: absolute; ${anchor}
    width: 12px; height: 12px;
    background-image: url("${url}");
    background-size: contain; background-repeat: no-repeat; background-position: center;
    pointer-events: none; z-index: 2;
  }`;
}

function buildCssText(
  ruleId: string,
  scopeType: 'cell' | 'row',
  light: CellStyleProperties,
  dark: CellStyleProperties,
  flash: {
    enabled: boolean;
    target: FlashTarget;
    mode: FlashMode;
    color: FlashColor;
    durationMs: number;
  } | null,
  indicator: RuleIndicator | undefined,
  animation: {
    enabled: boolean;
    kind: AnimationKind;
    durationMs: number;
  } | null,
): string {
  // Encode rule id with the same helper column-customization uses so a
  // future rule.id with chars outside [A-Za-z0-9_-] still produces a
  // matching class + selector pair. base36 generateId() is currently
  // safe but defense-in-depth for legacy snapshots / future id schemes.
  const safeRuleId = cssEscapeColId(ruleId);
  const cls = `.ds-rule-${safeRuleId}`;
  const surfaceSelector = scopeType === 'row' ? `.ag-row${cls} .ag-cell` : `.ag-cell${cls}`;
  const lightProps = styleToCSS(light);
  const darkProps = styleToCSS(dark);
  const lines: string[] = [];

  if (lightProps) lines.push(`:root:not(.dark):not([data-theme="dark"]) ${surfaceSelector} { ${lightProps} }`);
  if (darkProps) lines.push(`.dark ${surfaceSelector}, [data-theme="dark"] ${surfaceSelector} { ${darkProps} }`);
  if (lightProps && !darkProps) lines.push(`${surfaceSelector} { ${lightProps} }`);

  if (flash?.enabled) {
    // Scoped colour var: keeps two flashing rules on the same cell from
    // overwriting each other's colour. The cascade still picks one
    // `animation` winner (last-declared by priority), but each rule
    // keeps its own colour identity in isolation.
    const colorVar = `var(--ds-flash-${flash.color})`;
    const animName = `ds-flash-${safeRuleId}`;
    const iter = flash.mode === 'pulse' ? 'infinite' : '1';
    const fill = flash.mode === 'pulse' ? 'none' : 'forwards';
    const animDecl = `animation: ${animName} ${flash.durationMs}ms ease-in-out ${iter}; animation-fill-mode: ${fill};`;
    const colorDecl = `--ds-flash-color: ${colorVar};`;

    // Cell / row flash uses the rule's own class — the animation joins
    // the existing per-rule cell styling naturally.
    if (flash.target === 'cells' || flash.target === 'cells+headers' || flash.target === 'row') {
      lines.push(`${surfaceSelector} { ${colorDecl} ${animDecl} }`);
    }
    // Header flash uses a DEDICATED class so the rule's cell styling
    // (background-color, borders, etc.) doesn't leak onto the header —
    // only the colour-aware pulse is shared. Painted by index.ts's
    // header DOM watcher (AG-Grid has no headerClassRules).
    if (flash.target === 'headers' || flash.target === 'cells+headers') {
      const hdrCls = `.ag-header-cell.ds-flash-hdr-${safeRuleId}`;
      lines.push(`${hdrCls} { ${colorDecl} ${animDecl} }`);
    }
  }

  if (animation?.enabled) {
    // Target the value glyph, NOT the whole cell, so a rotation spins the
    // rendered emoji/icon in place rather than the entire cell box.
    // `display: inline-block` is required (transforms don't apply to inline
    // text) and `transform-origin: center` keeps the spin centred on the
    // glyph. Works for both scopes — `surfaceSelector` already resolves to
    // `.ag-cell…` (cell) or `.ag-row… .ag-cell` (row).
    const animName = ANIMATION_KEYFRAME_NAME[animation.kind];
    const timing = animation.kind === 'pulse' ? 'ease-in-out' : 'linear';
    lines.push(
      `${surfaceSelector} .ag-cell-value { display: inline-block; transform-origin: center; animation: ${animName} ${animation.durationMs}ms ${timing} infinite; }`,
    );
  }

  const indicatorCss = indicatorOverlayCSS(cls, indicator, scopeType);
  if (indicatorCss) lines.push(indicatorCss);

  // Row-scope separator kill — the theme's `.ag-row` border-bottom visibly
  // stripes adjacent highlighted rows without the `!important`.
  if (scopeType === 'row') {
    lines.push(`.ag-row${cls} { border-color: transparent !important; }`);
  }

  const lightBorder = borderOverlayCSS(`:root:not(.dark):not([data-theme="dark"]) ${surfaceSelector}`, light);
  const darkBorder1 = borderOverlayCSS(`.dark ${surfaceSelector}`, dark);
  const darkBorder2 = borderOverlayCSS(`[data-theme="dark"] ${surfaceSelector}`, dark);
  if (lightBorder) lines.push(lightBorder);
  if (darkBorder1) lines.push(darkBorder1);
  if (darkBorder2) lines.push(darkBorder2);
  if (lightBorder && !darkBorder1 && !darkBorder2) {
    const fallback = borderOverlayCSS(surfaceSelector, light);
    if (fallback) lines.push(fallback);
  }

  return lines.join('\n');
}

export function reinjectAllRules(css: CssHandle, rules: ConditionalRule[]): void {
  css.clear();
  // Palette ships once — per-rule classes reference --ds-flash-<color>.
  css.addRule(FLASH_PALETTE_RULE_ID, FLASH_PALETTE_CSS);
  // Value-glyph animation keyframes ship once — animating rules reference
  // them by name (`ds-anim-spin` etc.).
  css.addRule(ANIMATION_KEYFRAMES_RULE_ID, ANIMATION_KEYFRAMES_CSS);
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const safeRuleId = cssEscapeColId(rule.id);
    const flash = rule.flash?.enabled
      ? {
          enabled: true,
          target: rule.flash.target,
          mode: rule.flash.mode ?? DEFAULT_FLASH_MODE,
          color: rule.flash.color ?? DEFAULT_FLASH_COLOR,
          durationMs:
            typeof rule.flash.durationMs === 'number' && rule.flash.durationMs > 0
              ? Math.round(rule.flash.durationMs)
              : DEFAULT_FLASH_DURATION_MS,
        }
      : null;
    if (flash) {
      // Per-rule keyframes — unique name so rules with different
      // durationMs / mode don't fight over the shared `animation` slot.
      css.addRule(`conditional-flash-kf-${rule.id}`, buildFlashKeyframesCss(safeRuleId));
    }
    const animation = rule.animation?.enabled
      ? {
          enabled: true,
          kind: rule.animation.kind ?? DEFAULT_ANIMATION_KIND,
          durationMs:
            typeof rule.animation.durationMs === 'number' && rule.animation.durationMs > 0
              ? Math.round(rule.animation.durationMs)
              : DEFAULT_ANIMATION_DURATION_MS,
        }
      : null;
    css.addRule(
      `conditional-${rule.id}`,
      buildCssText(rule.id, rule.scope.type, rule.style.light, rule.style.dark, flash, rule.indicator, animation),
    );
  }
}

// ─── Trigger-column extraction ─────────────────────────────────────────────

/**
 * Walk a parsed expression AST and collect every column the predicate
 * depends on. Used by the runtime to know which value changes should
 * provoke a refresh / re-evaluation of a rule's `scope.columns` — without
 * this, AG-Grid only re-evaluates `cellClassRules` on the cell whose own
 * value changed, so a rule like `[price.old] < [price.new]` with scope
 * `['side','quantity']` would never repaint `side`/`quantity` when
 * `price` ticks.
 *
 * Triggers are stored as the **full dot-path** that AG-Grid uses as the
 * column id when `field` walks into a nested object (e.g. `field:
 * 'position.price'` → colId `'position.price'`). This keeps trigger keys
 * directly comparable against:
 *   - AG-Grid's `cellValueChanged` event `column.getColId()`
 *   - the path-keyed diff snapshot maintained by `processTimedActivations`
 *
 * Sources of column dependencies (covers the surfaces the editor docs
 * and the engine's evaluator actually wire up):
 *   - `[col]` / `[col.old]` / `[col.new]` — `ColumnRefNode` (diff suffix
 *     stripped; full nested path preserved)
 *   - `data.x.y.z` — `MemberNode` chain rooted on the `data` variable,
 *     collapsed into trigger `'x.y.z'`
 *   - `columns.x.y.z` — same, rooted on the `columns` (diff-aware) variable
 */
export function extractTriggerColumns(node: ExpressionNode): Set<string> {
  const out = new Set<string>();
  walkForTriggers(node, out);
  return out;
}

function walkForTriggers(node: ExpressionNode, out: Set<string>): void {
  switch (node.type) {
    case 'columnRef': {
      const id = stripDiffSuffix(node.columnId);
      if (id) out.add(id);
      return;
    }
    case 'member': {
      // Collapse `data.x.y.z` / `columns.x.y.z` into a single dot-path
      // trigger — this is the same shape AG-Grid emits as the column id
      // when a colDef's `field` walks into a nested object.
      const path = pathFromMemberChain(node);
      if (path !== null) {
        const cleaned = stripDiffSuffix(path);
        if (cleaned) out.add(cleaned);
        return;
      }
      walkForTriggers(node.object, out);
      return;
    }
    case 'binary':
      walkForTriggers(node.left, out);
      walkForTriggers(node.right, out);
      return;
    case 'unary':
      walkForTriggers(node.operand, out);
      return;
    case 'ternary':
      walkForTriggers(node.condition, out);
      walkForTriggers(node.consequent, out);
      walkForTriggers(node.alternate, out);
      return;
    case 'call':
      for (const a of node.args) walkForTriggers(a, out);
      return;
    case 'array':
      for (const el of node.elements) walkForTriggers(el, out);
      return;
    case 'literal':
    case 'variable':
      return;
  }
}

/**
 * Walk a member-access chain down to its root. If the root is the
 * `data` or `columns` variable, return the dot-path of property names
 * (in source order). Returns `null` for any other root — the caller
 * keeps recursing through the member's `object` in that case, in case
 * a sub-expression is itself a column-bearing tree.
 */
function pathFromMemberChain(node: ExpressionNode): string | null {
  const parts: string[] = [];
  let cursor: ExpressionNode = node;
  while (cursor.type === 'member') {
    parts.unshift(cursor.property);
    cursor = cursor.object;
  }
  if (cursor.type !== 'variable') return null;
  if (cursor.name !== 'data' && cursor.name !== 'columns') return null;
  return parts.join('.');
}

function stripDiffSuffix(id: string): string {
  return id.replace(/\.(old|new)$/i, '');
}

// ─── Predicate builders ────────────────────────────────────────────────────

/**
 * Compile to an AG-Grid string expression when possible (zero per-cell JS
 * cost), otherwise fall back to a function that evaluates the AST per cell.
 * Evaluation errors are swallowed — a broken rule must NOT crash the grid.
 */
function buildCellClassPredicate(
  engine: ExpressionEngineLike,
  rule: ConditionalRule,
  diffCacheByApi?: DiffCacheByApi,
  timedRuleStateByApi?: TimedRuleStateByApi,
): ((params: CellClassParams) => boolean) | string {
  const activeDurationMs = normalizeActiveDuration(rule.activeDurationMs);
  if (activeDurationMs != null) {
    return (params: CellClassParams) => {
      const colId =
        params.column && typeof params.column.getColId === 'function'
          ? params.column.getColId()
          : undefined;
      if (!colId) return false;
      return isTimedCellRuleActive(
        timedRuleStateByApi,
        params.api,
        params.node,
        rule.id,
        colId,
      );
    };
  }

  const hasDiffRefs = /\.[ \t]*(old|new)\]/i.test(rule.expression);
  // Try the AG-string optimisation path — v3 engine exposes `tryCompileToAgString`
  // on the concrete class; ExpressionEngineLike is intentionally narrow, so we
  // fall through to the function form when the helper isn't there.
  const tryCompile = (engine as { tryCompileToAgString?: (ast: unknown) => string | null }).tryCompileToAgString;
  if (!hasDiffRefs && typeof tryCompile === 'function') {
    try {
      const ast = engine.parse(rule.expression);
      const agString = tryCompile(ast);
      if (agString) return agString;
    } catch {
      /* fall through to function form */
    }
  }
  // Compile ONCE here, not per cell — the closure is reused for every cell this
  // rule paints. (parseAndEvaluate would hit the engine's parse cache, but
  // building the closure up front avoids even the per-cell cache lookup and is
  // behaviourally identical — see compileToFunction parity tests.)
  const evalRule = engine.compile(rule.expression);
  // Rules without diff refs never read overlay keys → empty key list.
  const diffKeys = hasDiffRefs ? buildRuleDiffKeys(engine, rule.expression) : [];
  return (params: CellClassParams) => {
    const data = params.data ?? {};
    const rowDiffs = getOrCreateRowDiffs(params.api, params.node, diffCacheByApi);
    const colId =
      params.column && typeof params.column.getColId === 'function'
        ? params.column.getColId()
        : undefined;
    // Own-column sync is unconditional — OTHER rules' `.old`/`.new`
    // refs on this column depend on this predicate maintaining the
    // diff continuity, not just this rule's own reads.
    if (rowDiffs && colId) {
      syncRowDiffEntry(rowDiffs, colId, params.value);
    }
    const columns = diffKeys !== null
      ? buildScopedColumnsContext(data, rowDiffs, diffKeys)
      : buildColumnsContext(data, rowDiffs);
    try {
      return Boolean(
        evalRule({
          x: params.value,
          value: params.value,
          data,
          columns,
        }),
      );
    } catch {
      return false;
    }
  };
}

export function buildRowClassPredicate(
  engine: ExpressionEngineLike,
  rule: ConditionalRule,
  diffCacheByApi?: DiffCacheByApi,
  timedRuleStateByApi?: TimedRuleStateByApi,
): (params: RowClassParams) => boolean {
  const activeDurationMs = normalizeActiveDuration(rule.activeDurationMs);
  if (activeDurationMs != null) {
    return (params: RowClassParams) =>
      isTimedRowRuleActive(
        timedRuleStateByApi,
        (params as RowClassParams & { api?: unknown }).api,
        params.node,
        rule.id,
      );
  }

  // Compile once — reused for every row this rule paints.
  const evalRule = engine.compile(rule.expression);
  const hasDiffRefs = /\.[ \t]*(old|new)\]/i.test(rule.expression);
  const diffKeys = hasDiffRefs ? buildRuleDiffKeys(engine, rule.expression) : [];
  return (params: RowClassParams) => {
    const data = params.data ?? {};
    // Row rules have no per-column paint hook, so a diff-consuming rule
    // syncs its OWN referenced columns before reading them. The old
    // shape Object.entries-walked EVERY top-level data key per row per
    // paint (52 entries + a per-call entries-array allocation on the
    // reference blotter) — and still missed nested paths, which the
    // getValueByPath sync now resolves correctly. Rules without diff
    // refs skip the diff machinery entirely.
    let rowDiffs: RowDiffMap | undefined;
    if (hasDiffRefs) {
      rowDiffs = getOrCreateRowDiffs(
        (params as RowClassParams & { api?: unknown }).api,
        params.node,
        diffCacheByApi,
      );
      if (rowDiffs) {
        if (diffKeys !== null) {
          for (const k of diffKeys) {
            syncRowDiffEntry(rowDiffs, k.base, getValueByPath(data, k.base));
          }
        } else {
          for (const [key, value] of Object.entries(data)) {
            syncRowDiffEntry(rowDiffs, key, value);
          }
        }
      }
    }
    const columns = diffKeys !== null
      ? buildScopedColumnsContext(data, rowDiffs, diffKeys)
      : buildColumnsContext(data, rowDiffs);
    try {
      return Boolean(
        evalRule({
          x: null,
          value: null,
          data,
          columns,
        }),
      );
    } catch {
      return false;
    }
  };
}

// ─── ColDef walker (cell rules) ────────────────────────────────────────────

export function applyCellRulesToDefs(
  defs: AnyColDef[],
  cellRules: ConditionalRule[],
  engine: ExpressionEngineLike,
  diffCacheByApi?: DiffCacheByApi,
  timedRuleStateByApi?: TimedRuleStateByApi,
): AnyColDef[] {
  return defs.map((def) => {
    if ('children' in def && Array.isArray(def.children)) {
      // Pass BOTH caches through — the old recursion dropped them, so
      // cells under a column GROUP lost diff-driven (.old/.new) and
      // timed-rule predicates entirely.
      const next = applyCellRulesToDefs(def.children, cellRules, engine, diffCacheByApi, timedRuleStateByApi);
      const unchanged = next.length === def.children.length && next.every((c, i) => c === def.children[i]);
      return unchanged ? def : ({ ...def, children: next } as ColGroupDef);
    }

    const colDef = def as ColDef;
    const colId = colDef.colId ?? colDef.field;
    if (!colId) return def;

    const applicable = cellRules.filter(
      (r) => r.scope.type === 'cell' && (r.scope as { type: 'cell'; columns: string[] }).columns.includes(colId),
    );
    if (applicable.length === 0) return def;

    const cellClassRules: NonNullable<ColDef['cellClassRules']> = {
      ...((colDef.cellClassRules as Record<string, unknown>) ?? {}),
    } as NonNullable<ColDef['cellClassRules']>;

    for (const rule of applicable) {
      // The KEY of cellClassRules is what AG-Grid stamps on the cell
      // DOM — must match the encoded selector emitted by buildCssText.
      (cellClassRules as Record<string, unknown>)[`ds-rule-${cssEscapeColId(rule.id)}`] =
        buildCellClassPredicate(engine, rule, diffCacheByApi, timedRuleStateByApi);
    }

    // Per-rule value formatters — highest priority wins.
    const formatterRules = applicable.filter((r) => !!r.valueFormatter);
    if (formatterRules.length > 0) {
      const compiled = formatterRules.map((rule) => ({
        predicate: buildCellClassPredicate(engine, rule, diffCacheByApi, timedRuleStateByApi),
        formatter: valueFormatterFromTemplate(rule.valueFormatter!),
        expression: rule.expression,
      }));
      const existing = colDef.valueFormatter;
      const existingFormatter = typeof existing === 'function' ? existing : undefined;
      (colDef as ColDef).valueFormatter = (params: ValueFormatterParams) => {
        for (let i = compiled.length - 1; i >= 0; i--) {
          const c = compiled[i];
          let matched = false;
          try {
            if (typeof c.predicate === 'string') {
              const data = params.data ?? {};
              const columns = buildColumnsContext(
                data,
                resolveRowDiffs(params.api, params.node, diffCacheByApi),
              );
              matched = Boolean(engine.parseAndEvaluate(c.expression, {
                x: params.value, value: params.value, data, columns,
              }));
            } else {
              matched = Boolean(c.predicate(params as CellClassParams));
            }
          } catch { matched = false; }
          if (matched) {
            try { return c.formatter({ value: params.value, data: params.data }); }
            catch { /* fall through */ }
          }
        }
        if (existingFormatter) return existingFormatter(params as never);
        return params.value == null ? '' : String(params.value);
      };
    }

    return { ...colDef, cellClassRules };
  });
}

function resolveRowDiffs(
  api: unknown,
  node: unknown,
  diffCacheByApi?: DiffCacheByApi,
): RowDiffMap | undefined {
  if (!diffCacheByApi) return undefined;
  if (!api || typeof api !== 'object') return undefined;
  if (!node || typeof node !== 'object') return undefined;
  return diffCacheByApi.get(api as object)?.get(node as object);
}

function getOrCreateRowDiffs(
  api: unknown,
  node: unknown,
  diffCacheByApi?: DiffCacheByApi,
): RowDiffMap | undefined {
  if (!diffCacheByApi) return undefined;
  if (!api || typeof api !== 'object') return undefined;
  if (!node || typeof node !== 'object') return undefined;
  let byRow = diffCacheByApi.get(api as object);
  if (!byRow) {
    byRow = new WeakMap<object, RowDiffMap>();
    diffCacheByApi.set(api as object, byRow);
  }
  let rowDiffs = byRow.get(node as object);
  if (!rowDiffs) {
    rowDiffs = new Map<string, CellDiffEntry>();
    byRow.set(node as object, rowDiffs);
  }
  return rowDiffs;
}

function syncRowDiffEntry(
  rowDiffs: RowDiffMap,
  colId: string,
  value: unknown,
): boolean {
  const prev = rowDiffs.get(colId);
  if (!prev) {
    rowDiffs.set(colId, { oldValue: value, newValue: value });
    return false;
  }
  if (Object.is(prev.newValue, value)) return false;
  rowDiffs.set(colId, { oldValue: prev.newValue, newValue: value });
  return true;
}

function buildColumnsContext(
  data: Record<string, unknown>,
  rowDiffs: RowDiffMap | undefined,
): Record<string, unknown> {
  const out = Object.create(data) as Record<string, unknown>;
  if (!rowDiffs || rowDiffs.size === 0) return out;
  for (const [colId, diff] of rowDiffs) {
    out[`${colId}.old`] = diff.oldValue;
    out[`${colId}.new`] = diff.newValue;
  }
  return out;
}

/**
 * Prebuilt diff-overlay keys for one rule — computed once at predicate
 * build time so the per-cell/per-row path does zero string
 * concatenation and overlays ONLY the diff entries the rule's
 * expression references. The row diff map accumulates an entry for
 * every column any predicate ever synced (bounded by column count, but
 * on a 52-column blotter that meant 104 own-property writes + string
 * concats per cell per paint for a rule that reads two columns).
 */
interface RuleDiffKeys {
  base: string;
  oldKey: string;
  newKey: string;
}

/** `null` = expression unparseable — dependency set unknown, caller
 *  falls back to the full overlay. */
function buildRuleDiffKeys(
  engine: ExpressionEngineLike,
  expression: string,
): RuleDiffKeys[] | null {
  try {
    const refs = extractTriggerColumns(engine.parse(expression) as ExpressionNode);
    return [...refs].map((base) => ({
      base,
      oldKey: `${base}.old`,
      newKey: `${base}.new`,
    }));
  } catch {
    return null;
  }
}

/**
 * Columns context overlaying only a rule's referenced diff entries.
 * When nothing needs overlaying, returns `data` itself — expressions
 * only READ the context, and plain `[col]` refs resolve identically
 * against the row object (see the bare-nested-path characterisation
 * tests), so the per-call `Object.create` is skipped entirely.
 */
function buildScopedColumnsContext(
  data: Record<string, unknown>,
  rowDiffs: RowDiffMap | undefined,
  diffKeys: ReadonlyArray<RuleDiffKeys>,
): Record<string, unknown> {
  if (!rowDiffs || rowDiffs.size === 0 || diffKeys.length === 0) return data;
  let out: Record<string, unknown> | null = null;
  for (const k of diffKeys) {
    const diff = rowDiffs.get(k.base);
    if (!diff) continue;
    if (out === null) out = Object.create(data) as Record<string, unknown>;
    out[k.oldKey] = diff.oldValue;
    out[k.newKey] = diff.newValue;
  }
  return out ?? data;
}

function normalizeActiveDuration(value: number | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value as number);
  return rounded > 0 ? rounded : null;
}

function getTimedRuleState(
  timedRuleStateByApi: TimedRuleStateByApi | undefined,
  api: unknown,
  node: unknown,
): TimedRuleStateByRule | undefined {
  // Per-grid isolation: the runtime registers its TimedRuleStore's map
  // under the GridApi. No registration (grid not ready yet, or no timed
  // runtime mounted) → no activations → inactive.
  if (!timedRuleStateByApi || !api || typeof api !== 'object') return undefined;
  const byRowId = timedRuleStateByApi.get(api as object);
  if (!byRowId) return undefined;
  const rowId = resolveRowId(node);
  if (!rowId) return undefined;
  return byRowId.get(rowId);
}

function isTimedCellRuleActive(
  timedRuleStateByApi: TimedRuleStateByApi | undefined,
  api: unknown,
  node: unknown,
  ruleId: string,
  colId: string,
): boolean {
  const trace = isTraceOn();
  const rowId = trace ? resolveRowId(node) : null;
  const stateByRule = getTimedRuleState(timedRuleStateByApi, api, node);
  if (!stateByRule) {
    if (trace) traceTimed('predicate:cell no state', { rowId, ruleId, colId });
    return false;
  }
  const entry = stateByRule.get(ruleId);
  if (!entry) {
    if (trace) traceTimed('predicate:cell no rule entry', { rowId, ruleId, colId });
    return false;
  }
  const expiry = entry.cellsUntil.get(colId);
  if (!expiry) {
    if (trace) traceTimed('predicate:cell no column expiry', { rowId, ruleId, colId });
    return false;
  }
  if (expiry > Date.now()) {
    if (trace) traceTimed('predicate:cell ACTIVE', { rowId, ruleId, colId, expiry });
    return true;
  }
  entry.cellsUntil.delete(colId);
  if (!entry.rowUntil && entry.cellsUntil.size === 0) stateByRule.delete(ruleId);
  if (trace) traceTimed('predicate:cell EXPIRED', { rowId, ruleId, colId, expiry });
  return false;
}

function isTimedRowRuleActive(
  timedRuleStateByApi: TimedRuleStateByApi | undefined,
  api: unknown,
  node: unknown,
  ruleId: string,
): boolean {
  const trace = isTraceOn();
  const rowId = trace ? resolveRowId(node) : null;
  const stateByRule = getTimedRuleState(timedRuleStateByApi, api, node);
  if (!stateByRule) {
    if (trace) traceTimed('predicate:row no state', { rowId, ruleId });
    return false;
  }
  const entry = stateByRule.get(ruleId);
  if (!entry?.rowUntil) {
    if (trace) traceTimed('predicate:row no expiry', { rowId, ruleId });
    return false;
  }
  if (entry.rowUntil > Date.now()) {
    if (trace) traceTimed('predicate:row ACTIVE', { rowId, ruleId, expiry: entry.rowUntil });
    return true;
  }
  entry.rowUntil = undefined;
  if (entry.cellsUntil.size === 0) stateByRule.delete(ruleId);
  if (trace) traceTimed('predicate:row EXPIRED', { rowId, ruleId });
  return false;
}

function resolveRowId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const candidate = (node as { id?: unknown }).id;
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : null;
}

/**
 * Trace helper for the timed-rule subsystem.
 *
 * Off by default — `setTimeout` + `cellValueChanged` paths fire dozens
 * to hundreds of trace points per second under live ticks, and the
 * resulting `console.log` storm is one of the bigger CPU costs in
 * production. Opt in explicitly per session by setting
 * `window.__CS_TIMED_TRACE__ = true` in the DevTools console.
 */
/** Cheap probe for gating trace CALL SITES — the payload object literals
 *  are otherwise allocated per cell per paint even with tracing off. */
function isTraceOn(): boolean {
  try {
    return (globalThis as { __CS_TIMED_TRACE__?: boolean }).__CS_TIMED_TRACE__ === true;
  } catch {
    return false;
  }
}

function traceTimed(message: string, payload?: unknown): void {
  try {
    const flag = (globalThis as { __CS_TIMED_TRACE__?: boolean }).__CS_TIMED_TRACE__;
    if (flag !== true) return;
    if (payload === undefined) {
      console.log(TRACE_PREFIX, message);
      return;
    }
    console.log(TRACE_PREFIX, message, payload);
  } catch {
    // no-op
  }
}
