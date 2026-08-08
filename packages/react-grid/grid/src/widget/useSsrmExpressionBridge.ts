import { useEffect, useMemo, useRef } from 'react';
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

function buildExpressionSnapshot(
  calculated: CalculatedColumnsState,
  styling: ConditionalStylingState,
  alerts: AlertsState,
): MarketsGridExpressionSnapshot {
  return {
    calculatedColumns: calculated.virtualColumns.map((col) => ({
      id: col.colId,
      field: col.colId,
      expression: col.expression,
    })),
    styleRules: styling.rules
      .filter((rule) => rule.enabled)
      .map((rule) => ({
        id: rule.id,
        expression: rule.expression,
      })),
    alertRules: alerts.rules
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
  const [calculated] = useModuleState<CalculatedColumnsState>(CALCULATED_COLUMNS_MODULE_ID);
  const [styling] = useModuleState<ConditionalStylingState>(CONDITIONAL_STYLING_MODULE_ID);
  const [alerts] = useModuleState<AlertsState>(ALERTS_MODULE_ID);

  const snapshot = useMemo(
    () => buildExpressionSnapshot(calculated, styling, alerts),
    [calculated, styling, alerts],
  );
  const rules = useMemo(() => toSsrmExpressionRules(snapshot), [snapshot]);

  const providerRef = useRef(provider);
  providerRef.current = provider;

  useEffect(() => {
    if (!enabled || !provider) return;

    const timer = setTimeout(() => {
      void providerRef.current?.configureExpressions([...rules]);
    }, PUSH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [enabled, provider, rules]);
}
