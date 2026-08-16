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
 * reduced module lists legitimately omit all three. Treat a missing module as
 * "contributes no rules" rather than throwing through the host's render.
 *
 * No `editableRules` here, and that is not an omission: nothing in the
 * customizer authors an editability EXPRESSION. Editability is a boolean
 * throughout — `general-settings.defaultEditable`, `column-templates`'
 * per-column `editable`, `column-customization`'s resolved override — and a
 * boolean needs no plane to evaluate it. `MarketsGridExpressionSnapshot`
 * still carries `editableRules` because a host composing a snapshot directly
 * is a supported path, and both ends of it now work: `toSsrmExpressionRules`
 * emits `kind: 'editable'`, the plane evaluates it, and the surface's column
 * bindings gate the cell on the result.
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
 * Live bridge from MarketsGrid customizer expression modules → SSRM worker
 * plane. This hook only pushes rule config; the plane evaluates.
 *
 * The client modules' `activate()` still runs, and should: they own the
 * authoring UI, and conditional-styling's own pass is the RICHER of the two
 * (flash, indicators, glyph animation and timed activations have no plane
 * equivalent) and is correct under either row model, because its expressions
 * are row-local against the row in hand.
 *
 * Calculated columns are the one place the two genuinely competed, and the
 * plane now wins there by construction rather than by a flag: rows arrive
 * with the fields it computed stamped on them (`COMPUTED_FIELDS_KEY`), and
 * `buildVirtualColDef`'s valueGetter returns those instead of re-deriving a
 * column-wide aggregate from whichever ~2,000 rows the block cache holds.
 * That is what the `platform.ssrmMode` flag this comment used to promise
 * would have been for — and a flag is exactly what the port exists to avoid.
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
