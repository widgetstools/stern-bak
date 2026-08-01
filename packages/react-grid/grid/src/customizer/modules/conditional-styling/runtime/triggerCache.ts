/**
 * Per-rule trigger-column cache.
 *
 * Each conditional-styling rule has a row-level predicate plus a paint
 * surface (`scope.columns`). When ANY column referenced by the predicate
 * ticks, every cell in `scope.columns` for that row must re-evaluate its
 * `cellClassRules` predicate so the rule's verdict propagates uniformly
 * across the scope. AG-Grid's default behaviour only re-evaluates the
 * cell whose own value changed, which is what produced the "only the
 * first column gets styled" symptom for diff-driven rules like
 * `[price.old] < [price.new]`.
 *
 * This cache memoises the set of trigger columns per rule so the
 * cellValueChanged handler can decide "should this row + scope be
 * re-painted?" in O(rules) time without re-parsing expressions on every
 * tick.
 *
 * Keyed by `rule.id + ':' + rule.expression` so a no-op rule edit
 * (renaming, toggling colour) doesn't churn the parse cache.
 */

import type { PlatformHandle } from '@wellsfargo-starui/core';
import { extractTriggerColumns } from '../transforms';
import type { ConditionalRule, ConditionalStylingState } from '../state';

export interface TriggerCache {
  /** Stable cache key for a rule (id + expression hash). */
  cacheKey: (rule: { id: string; expression: string }) => string;
  /** Refresh the entire cache against a rule set; evicts vanished rules. */
  rebuild: (rules: readonly ConditionalRule[]) => void;
  /** Look up the trigger column set for one rule. */
  get: (rule: { id: string; expression: string }) => ReadonlySet<string> | undefined;
}

export function createTriggerCache(
  platform: PlatformHandle<ConditionalStylingState>,
): TriggerCache {
  const triggersByRule = new Map<string, ReadonlySet<string>>();

  const cacheKey = (rule: { id: string; expression: string }) =>
    `${rule.id}::${rule.expression}`;

  const rebuild = (rules: readonly ConditionalRule[]): void => {
    const seenKeys = new Set<string>();
    const engine = platform.resources.expression();
    for (const r of rules) {
      const key = cacheKey(r);
      seenKeys.add(key);
      if (triggersByRule.has(key)) continue;
      try {
        const ast = engine.parse(r.expression) as Parameters<typeof extractTriggerColumns>[0];
        triggersByRule.set(key, extractTriggerColumns(ast));
      } catch {
        // Unparseable expression — no triggers known. Predicate will
        // already short-circuit via its own try/catch.
        triggersByRule.set(key, new Set<string>());
      }
    }
    // Evict cache entries for rules that no longer exist OR whose
    // expression changed (the key changes, so the old entry is now
    // unreferenced).
    for (const key of [...triggersByRule.keys()]) {
      if (!seenKeys.has(key)) triggersByRule.delete(key);
    }
  };

  const get = (rule: { id: string; expression: string }) =>
    triggersByRule.get(cacheKey(rule));

  return { cacheKey, rebuild, get };
}
