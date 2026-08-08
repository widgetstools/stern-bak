/**
 * Map MarketsGrid customizer expression state → worker {@link ExpressionRule}s.
 * Keep this adapter tiny — authoring stays in MarketsGrid modules.
 */
import type { ExpressionRule } from '@wellsfargo-starui/data';

export interface CalculatedColumnLike {
  id?: string;
  field: string;
  expression: string;
}

export interface StyleRuleLike {
  id: string;
  expression: string;
}

export interface AlertRuleLike {
  id: string;
  expression: string;
}

export interface EditableRuleLike {
  id: string;
  field?: string;
  expression: string;
}

export interface MarketsGridExpressionSnapshot {
  calculatedColumns?: readonly CalculatedColumnLike[];
  styleRules?: readonly StyleRuleLike[];
  alertRules?: readonly AlertRuleLike[];
  editableRules?: readonly EditableRuleLike[];
}

/** Convert MarketsGrid module expression state into SSRM plane rules. */
export function toSsrmExpressionRules(
  snap: MarketsGridExpressionSnapshot,
): ExpressionRule[] {
  const out: ExpressionRule[] = [];
  for (const col of snap.calculatedColumns ?? []) {
    if (!col.expression?.trim() || !col.field) continue;
    out.push({
      id: col.id ?? `calc-${col.field}`,
      kind: 'calculated',
      field: col.field,
      expression: col.expression,
    });
  }
  for (const rule of snap.styleRules ?? []) {
    if (!rule.expression?.trim()) continue;
    out.push({
      id: rule.id,
      kind: 'style',
      expression: rule.expression,
    });
  }
  for (const rule of snap.alertRules ?? []) {
    if (!rule.expression?.trim()) continue;
    out.push({
      id: rule.id,
      kind: 'alert',
      expression: rule.expression,
    });
  }
  for (const rule of snap.editableRules ?? []) {
    if (!rule.expression?.trim()) continue;
    out.push({
      id: rule.id,
      kind: 'editable',
      field: rule.field,
      expression: rule.expression,
    });
  }
  return out;
}
