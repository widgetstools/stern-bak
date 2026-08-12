import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { AlertsState } from '@wellsfargo-starui/core';
import { useModuleState } from '../customizer/hooks/useModuleState.js';
import {
  CALCULATED_COLUMNS_MODULE_ID,
  type CalculatedColumnsState,
} from '../customizer/modules/calculated-columns/index.js';
import {
  CONDITIONAL_STYLING_MODULE_ID,
  type ConditionalStylingState,
} from '../customizer/modules/conditional-styling/index.js';
import { ALERTS_MODULE_ID } from '../customizer/modules/alerts/index.js';
import {
  toSsrmExpressionRules,
  type MarketsGridExpressionSnapshot,
} from '../ssrm/expressionBridge.js';

const PUSH_DEBOUNCE_MS = 25;

/**
 * Slices are `undefined` whenever their module isn't registered — the store
 * seeds `moduleStates` from the module list alone, so presets like
 * `MINIMAL_MODULES` legitimately omit all three. Treat a missing module as
 * "contributes no rules" rather than throwing through the host's render.
 */
function buildExpressionSnapshot(
  calculated: CalculatedColumnsState | undefined,
  styling: ConditionalStylingState | undefined,
  alerts: AlertsState | undefined,
): MarketsGridExpressionSnapshot {
  return {
    calculatedColumns: (calculated?.virtualColumns ?? []).map((col) => ({
      id: col.colId,
      field: col.colId,
      expression: col.expression,
    })),
    styleRules: (styling?.rules ?? [])
      .filter((rule) => rule.enabled)
      .map((rule) => ({
        id: rule.id,
        expression: rule.expression,
      })),
    alertRules: (alerts?.rules ?? [])
      .filter(
        (rule): rule is typeof rule & { trigger: { kind: 'dataChange'; expression: string } } =>
          rule.enabled && rule.trigger.kind === 'dataChange',
      )
      .map((rule) => ({
        id: rule.id,
        expression: rule.trigger.expression,
      })),
  };
}

/**
 * Live bridge from MarketsGrid customizer expression modules → SSRM worker plane.
 * Worker owns calc/style/alerts evaluation; this hook only pushes rule config.
 *
 * SSRM: client module `activate()` still runs for authoring UI — follow-up:
 * gate client-side row mutation when `platform.ssrmMode` is set (see final-branch-review #2).
 */
export function useSsrmExpressionBridge(
  provider: ISsrmDataProvider | null | undefined,
  enabled: boolean,
): void {
  const [calculated] = useModuleState<CalculatedColumnsState | undefined>(
    CALCULATED_COLUMNS_MODULE_ID,
  );
  const [styling] = useModuleState<ConditionalStylingState | undefined>(
    CONDITIONAL_STYLING_MODULE_ID,
  );
  const [alerts] = useModuleState<AlertsState | undefined>(ALERTS_MODULE_ID);

  const snapshot = useMemo(
    () => buildExpressionSnapshot(calculated, styling, alerts),
    [calculated, styling, alerts],
  );
  const rules = useMemo(() => toSsrmExpressionRules(snapshot), [snapshot]);

  const providerRef = useRef(provider);
  providerRef.current = provider;

  /**
   * The worker's expression plane is keyed by `providerId`, so grids sharing a
   * provider share one rule set. A grid that has never contributed a rule must
   * stay silent rather than announce `[]` — otherwise mounting a second grid
   * wipes the first one's calculated columns, styling and alerts.
   * Once this bridge has pushed real rules, an empty push is a genuine
   * "user deleted them" and must go through.
   */
  const hasPushedRules = useRef(false);

  /** Latest rules, for re-pushing on events that carry no dependency change. */
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  const push = useCallback(() => {
    const target = providerRef.current;
    if (!target) return;
    const next = rulesRef.current;
    if (next.length === 0 && !hasPushedRules.current) return;
    if (next.length > 0) hasPushedRules.current = true;
    void target.configureExpressions([...next]);
  }, []);

  useEffect(() => {
    if (!enabled || !provider) return;

    const timer = setTimeout(push, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, provider, rules, push]);

  /**
   * A provider restart disposes the worker plane along with its rules, and
   * nothing above re-runs (the deps are unchanged across a restart). Re-push
   * when the provider reports itself ready again, or the features silently
   * stop working after every reconnect.
   */
  useEffect(() => {
    if (!enabled || !provider?.onStatus) return;

    let wasInterrupted = false;
    const off = provider.onStatus((status) => {
      if (status === 'loading' || status === 'error') {
        wasInterrupted = true;
        return;
      }
      if (status === 'ready' && wasInterrupted) {
        wasInterrupted = false;
        push();
      }
    });
    return off;
  }, [enabled, provider, push]);
}
