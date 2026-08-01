/**
 * Conditional Styling — expression-driven rules that paint cells or rows.
 *
 * Priority 20 (after column-customization=10). Carries into AG-Grid via
 * `ColDef.cellClassRules` (cell-scope) + `GridOptions.rowClassRules`
 * (row-scope); all styling delivered via injected CSS classes so dark/light
 * theming is a CSS event, not a JS recompute.
 *
 * Header flash + header indicator badges can't ride cellClassRules
 * (AG-Grid has no `headerClassRules`), so the runtime opens a thin DOM
 * watcher in `activate()` that toggles per-column classes whenever the
 * underlying rule state changes match.
 *
 * Module layout — this file is the module shell only. The runtime lives
 * under ./runtime, the legacy-payload migration in deserializeMigration.ts:
 *
 *   ./runtime/utils.ts            — pure helpers (resolveRowId, normalizeDuration, …)
 *   ./runtime/schedulers.ts       — refresh + targeted-refresh + expiry timer
 *   ./runtime/triggerCache.ts     — per-rule trigger-column memoisation
 *   ./runtime/headerPainter.ts    — evaluate() + class-diff DOM repaint
 *   ./runtime/timedActivations.ts — processTimedActivations + cellValueChanged
 *   ./runtime/activate.ts         — orchestrator wiring all subsystems
 *   ./deserializeMigration.ts     — legacy-profile normaliser
 */

import type { Module } from '@wellsfargo-starui/core';
import {
  INITIAL_CONDITIONAL_STYLING,
  type ConditionalStylingState,
} from './state';
import {
  applyCellRulesToDefs,
  buildRowClassPredicate,
  CONDITIONAL_DIFF_CACHE_KEY,
  CONDITIONAL_TIMED_RULE_CACHE_KEY,
  type DiffCacheByApi,
  type TimedRuleStateByApi,
  reinjectAllRules,
} from './transforms';
import { cssEscapeColId } from '../column-customization/transforms';
import {
  ConditionalStylingEditor,
  ConditionalStylingList,
  ConditionalStylingPanel,
} from './ConditionalStylingPanel';
import { deserializeConditionalStylingState } from './deserializeMigration';
import { activateConditionalStyling } from './runtime/activate';

export const CONDITIONAL_STYLING_MODULE_ID = 'conditional-styling';

const CSS_HANDLE_KEY = CONDITIONAL_STYLING_MODULE_ID;

export const conditionalStylingModule: Module<ConditionalStylingState> = {
  id: CONDITIONAL_STYLING_MODULE_ID,
  name: 'Style Rules',
  code: '01',
  schemaVersion: 1,
  priority: 20,

  getInitialState: () => ({ ...INITIAL_CONDITIONAL_STYLING, rules: [] }),

  /**
   * Mounts the header-flash DOM watcher + timed-activation runtime.
   * All other side effects (CSS injection) happen inside the transformers
   * and are cleaned up by ResourceScope.dispose when the grid destroys.
   */
  activate: activateConditionalStyling,

  transformColumnDefs(defs, state, ctx) {
    const css = ctx.resources.css(CSS_HANDLE_KEY);
    reinjectAllRules(css, state.rules);
    const diffCacheByApi = ctx.resources.cache<object, WeakMap<object, Map<string, { oldValue: unknown; newValue: unknown }>>>(
      CONDITIONAL_DIFF_CACHE_KEY,
    ) as DiffCacheByApi;

    const cellRules = state.rules
      .filter((r) => r.enabled && r.scope.type === 'cell')
      .sort((a, b) => a.priority - b.priority);
    if (cellRules.length === 0) return defs;
    // Same per-grid cache instance the runtime registers its
    // TimedRuleStore into (keyed by GridApi) — timed predicates read
    // THIS grid's activations, never another grid's.
    const timedStateByApi = ctx.resources.cache<object, object>(
      CONDITIONAL_TIMED_RULE_CACHE_KEY,
    ) as TimedRuleStateByApi;
    return applyCellRulesToDefs(
      defs,
      cellRules,
      ctx.resources.expression(),
      diffCacheByApi,
      timedStateByApi,
    );
  },

  transformGridOptions(opts, state, ctx) {
    const rowRules = state.rules
      .filter((r) => r.enabled && r.scope.type === 'row')
      .sort((a, b) => a.priority - b.priority);
    const engine = ctx.resources.expression();
    const diffCacheByApi = ctx.resources.cache<object, WeakMap<object, Map<string, { oldValue: unknown; newValue: unknown }>>>(
      CONDITIONAL_DIFF_CACHE_KEY,
    ) as DiffCacheByApi;
    const timedStateByApi = ctx.resources.cache<object, object>(
      CONDITIONAL_TIMED_RULE_CACHE_KEY,
    ) as TimedRuleStateByApi;
    // Always emit rowClassRules so the host's setGridOption sync clears
    // stale predicates when a rule's scope flips row→cell.
    const rowClassRules: NonNullable<typeof opts.rowClassRules> = {
      ...((opts.rowClassRules as Record<string, unknown>) ?? {}),
    } as NonNullable<typeof opts.rowClassRules>;
    for (const rule of rowRules) {
      // KEY must match the encoded selector emitted by buildCssText —
      // see cssEscapeColId in column-customization for the rationale.
      (rowClassRules as Record<string, unknown>)[`ds-rule-${cssEscapeColId(rule.id)}`] =
        buildRowClassPredicate(
          engine,
          rule,
          diffCacheByApi,
          timedStateByApi,
        );
    }
    return { ...opts, rowClassRules };
  },

  serialize: (state) => state,

  deserialize: (raw) => deserializeConditionalStylingState(raw),

  // v4: native master-detail slots — the settings sheet renders these
  // directly instead of the flat `SettingsPanel` fallback.
  ListPane: ConditionalStylingList,
  EditorPane: ConditionalStylingEditor,
  SettingsPanel: ConditionalStylingPanel,
};

export type {
  ConditionalRule,
  ConditionalStylingState,
  FlashColor,
  FlashConfig,
  FlashMode,
  FlashTarget,
  IndicatorPosition,
  IndicatorTarget,
  RuleIndicator,
  RuleScope,
} from './state';
export { FLASH_PALETTE } from './transforms';
export { INDICATOR_ICONS, findIndicatorIcon } from './indicatorIcons';
export type { IndicatorIconDef } from './indicatorIcons';
export { INITIAL_CONDITIONAL_STYLING } from './state';
export { toStyleEditorValue, fromStyleEditorValue } from './styleBridge';
