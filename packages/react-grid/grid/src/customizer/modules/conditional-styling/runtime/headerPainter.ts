/**
 * Header flash + indicator class painter.
 *
 * AG-Grid carries cell-scope rules via `cellClassRules`, but headers have
 * no equivalent (`headerClassRules` doesn't exist). This module bridges
 * the gap: it walks the rule list, evaluates each predicate against the
 * filtered row set, and toggles per-rule CSS classes on
 * `.ag-header-cell[col-id="..."]` directly.
 *
 * Differential repaint: we cache the last-painted column set per rule
 * and mutate ONLY the delta — without this, the header treatment would
 * flicker on every live tick because removing + re-adding the class
 * restarts CSS animations.
 *
 * Public surface: a single `evaluate()` call. Wire it into onReady /
 * modelUpdated / filterChanged listeners in the orchestrator.
 */

import type { PlatformHandle } from '@wellsfargo-starui/core';
import { cssEscapeColId } from '@wellsfargo-starui/core';
import type { ConditionalRule, ConditionalStylingState } from '@wellsfargo-starui/core';
import type { DiffCacheByApi } from '@wellsfargo-starui/core';
import { buildColumnsContextFromDiffs } from './utils';

export interface HeaderPainter {
  /** Paint headers based on the current rule predicates + filtered rows. */
  evaluate: () => void;
}

/** True when any enabled rule targets header flash or header indicators. */
export function hasHeaderPaintRules(state: ConditionalStylingState): boolean {
  return state.rules.some((r) => {
    if (!r.enabled || r.scope.type !== 'cell') return false;
    if (
      r.flash?.enabled
      && (r.flash.target === 'headers' || r.flash.target === 'cells+headers')
    ) {
      return true;
    }
    if (!r.indicator?.icon) return false;
    const target = r.indicator.target ?? 'cells+headers';
    return target === 'headers' || target === 'cells+headers';
  });
}

export function createHeaderPainter(
  platform: PlatformHandle<ConditionalStylingState>,
  diffCacheByApi: DiffCacheByApi,
): HeaderPainter {
  // Per-rule column sets last painted — used to compute the diff against
  // the next-paint set so we can mutate only the changes. Without this
  // the headers flicker on every live tick.
  const lastFlashColsByRule = new Map<string, Set<string>>();
  const lastIndicatorColsByRule = new Map<string, Set<string>>();
  const notFilter = ':not(.ag-floating-filter)';

  const applyHeaderClassDelta = (
    last: Map<string, Set<string>>,
    next: Map<string, Set<string>>,
    classFor: (ruleId: string) => string,
  ) => {
    const allRuleIds = new Set<string>([...last.keys(), ...next.keys()]);
    for (const ruleId of allRuleIds) {
      const lastCols = last.get(ruleId) ?? new Set<string>();
      const nextCols = next.get(ruleId) ?? new Set<string>();
      const cls = classFor(ruleId);
      for (const colId of lastCols) {
        if (nextCols.has(colId)) continue;
        document.querySelectorAll(`.ag-header-cell${notFilter}[col-id="${CSS.escape(colId)}"]`).forEach((el) => {
          el.classList.remove(cls);
        });
      }
      for (const colId of nextCols) {
        if (lastCols.has(colId)) continue;
        document.querySelectorAll(`.ag-header-cell${notFilter}[col-id="${CSS.escape(colId)}"]`).forEach((el) => {
          el.classList.add(cls);
        });
      }
      if (nextCols.size === 0) last.delete(ruleId);
      else last.set(ruleId, nextCols);
    }
  };

  const evaluate = (): void => {
    const api = platform.api.api;
    if (!api || typeof document === 'undefined') return;
    const rowDiffCache = diffCacheByApi.get(api as object);
    const state = platform.getState();
    const engine = platform.resources.expression();

    const headerFlashRules = state.rules.filter(
      (r) => r.enabled && r.flash?.enabled && r.scope.type === 'cell' &&
        (r.flash.target === 'headers' || r.flash.target === 'cells+headers'),
    );
    const headerIndicatorRules = state.rules.filter((r) => {
      if (!r.enabled || r.scope.type !== 'cell' || !r.indicator?.icon) return false;
      const target = r.indicator.target ?? 'cells+headers';
      return target === 'headers' || target === 'cells+headers';
    });

    if (headerFlashRules.length === 0 && headerIndicatorRules.length === 0) {
      applyHeaderClassDelta(
        lastFlashColsByRule,
        new Map<string, Set<string>>(),
        (ruleId) => `ds-flash-hdr-${cssEscapeColId(ruleId)}`,
      );
      applyHeaderClassDelta(
        lastIndicatorColsByRule,
        new Map<string, Set<string>>(),
        (ruleId) => `ds-rule-${cssEscapeColId(ruleId)}`,
      );
      return;
    }

    const anyRowMatches = (rule: ConditionalRule): boolean => {
      // Compile ONCE per rule per pass (cache-hit after the first) —
      // `parseAndEvaluate` per row re-interprets the AST for every one
      // of up to 20k filtered rows per rule per flush; the compiled
      // closure is allocation-free per call.
      let fn: ReturnType<typeof engine.compile>;
      try {
        fn = engine.compile(rule.expression);
      } catch {
        return false;
      }
      let match = false;
      api.forEachNodeAfterFilter((node) => {
        if (match) return;
        const data = node.data ?? {};
        const columns = buildColumnsContextFromDiffs(
          data,
          rowDiffCache?.get(node as object),
        );
        try {
          if (fn({ x: null, value: null, data, columns })) {
            match = true;
          }
        } catch { /* swallow per-row */ }
      });
      return match;
    };

    // Compute the *next* per-rule column sets that should be painted.
    const nextFlashColsByRule = new Map<string, Set<string>>();
    const nextIndicatorColsByRule = new Map<string, Set<string>>();
    for (const rule of headerFlashRules) {
      if (rule.scope.type !== 'cell') continue;
      if (anyRowMatches(rule)) nextFlashColsByRule.set(rule.id, new Set(rule.scope.columns));
    }
    for (const rule of headerIndicatorRules) {
      if (rule.scope.type !== 'cell') continue;
      if (anyRowMatches(rule)) nextIndicatorColsByRule.set(rule.id, new Set(rule.scope.columns));
    }

    applyHeaderClassDelta(
      lastFlashColsByRule,
      nextFlashColsByRule,
      (ruleId) => `ds-flash-hdr-${cssEscapeColId(ruleId)}`,
    );
    applyHeaderClassDelta(
      lastIndicatorColsByRule,
      nextIndicatorColsByRule,
      (ruleId) => `ds-rule-${cssEscapeColId(ruleId)}`,
    );
  };

  return { evaluate };
}
