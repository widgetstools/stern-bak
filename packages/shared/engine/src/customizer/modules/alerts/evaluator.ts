/**
 * Pure, framework-free evaluators for each alert trigger family. Each returns
 * `AlertHit | null` so the hot path stays branchless — no exceptions, no
 * thrown predicates, no per-call allocations beyond the result object.
 *
 * The runtime layer wires AG-Grid events into these functions and uses the
 * returned hits to construct `AlertNotification` records.
 */

import type { ExpressionEngineLike } from '../../../platform/types';
import type {
  AlertRule,
  AlertSeverity,
  DataChangeRule,
  RelativeChangeDirection,
  RelativeChangeMode,
  RelativeChangeRule,
  RowChangeEvent,
  RowChangeRule,
} from './state';

/** A minimal evaluation result. The dispatcher wraps this into a notification. */
export interface AlertHit {
  ruleId: string;
  rowId: string;
  column: string | null;
  value: unknown;
  prevValue: unknown;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function coerceNumeric(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ─── Data-change trigger ───────────────────────────────────────────────────

/**
 * Evaluate a `dataChange` rule against a row context. Returns a hit when the
 * boolean expression is truthy. Expression parse / evaluate errors are
 * swallowed (return `null`) so a malformed rule never crashes the grid.
 */
export function evaluateDataChangeRule(
  rule: DataChangeRule,
  ctx: {
    rowId: string;
    data: Record<string, unknown>;
    /** The column whose value just changed (if known). Used for column-scope filter. */
    changedColumn?: string;
    /** The changed cell's new value (`x` / `value` in the expression context). */
    value?: unknown;
  },
  engine: ExpressionEngineLike,
): AlertHit | null {
  const scopeCol = rule.trigger.column;
  if (scopeCol && ctx.changedColumn && scopeCol !== ctx.changedColumn) {
    return null;
  }
  let result: unknown;
  try {
    result = engine.parseAndEvaluate(rule.trigger.expression, {
      x: ctx.value,
      value: ctx.value,
      data: ctx.data,
    });
  } catch {
    return null;
  }
  if (!result) return null;
  const column = scopeCol ?? ctx.changedColumn ?? null;
  return {
    ruleId: rule.id,
    rowId: ctx.rowId,
    column,
    value: column ? ctx.value : null,
    prevValue: null,
  };
}

// ─── Relative-change trigger ───────────────────────────────────────────────

/**
 * Evaluate a `relativeChange` rule. Returns a hit when the delta between
 * `prev` and `next` clears the configured threshold in the configured
 * direction. Silent (returns `null`) on the first observation (`prev`
 * undefined) and on any non-numeric coercion.
 */
export function computeRelativeChange(
  rule: RelativeChangeRule,
  rowId: string,
  prev: unknown,
  next: unknown,
): AlertHit | null {
  if (prev === undefined) return null;
  const prevN = coerceNumeric(prev);
  const nextN = coerceNumeric(next);
  if (prevN === null || nextN === null) return null;
  if (prevN === nextN) return null;

  const direction: RelativeChangeDirection = rule.trigger.direction ?? 'both';
  const sign = nextN > prevN ? 'up' : 'down';
  if (direction !== 'both' && direction !== sign) return null;

  const mode: RelativeChangeMode = rule.trigger.mode;
  if (mode === 'ANY_CHANGE') {
    return hit(rule.id, rowId, rule.trigger.column, nextN, prevN);
  }

  const threshold = rule.trigger.threshold;
  if (!isFiniteNumber(threshold) || threshold < 0) return null;

  if (mode === 'ABSOLUTE_CHANGE') {
    if (Math.abs(nextN - prevN) < threshold) return null;
    return hit(rule.id, rowId, rule.trigger.column, nextN, prevN);
  }

  // PERCENT_CHANGE — threshold expressed as a percent (e.g. 5 = 5%)
  if (prevN === 0) return null;
  const pct = Math.abs((nextN - prevN) / prevN) * 100;
  if (pct < threshold) return null;
  return hit(rule.id, rowId, rule.trigger.column, nextN, prevN);
}

function hit(
  ruleId: string,
  rowId: string,
  column: string,
  value: unknown,
  prevValue: unknown,
): AlertHit {
  return { ruleId, rowId, column, value, prevValue };
}

// ─── Row-change trigger ────────────────────────────────────────────────────

/**
 * Map row add/remove sets against the active rules and return one hit per
 * (rule, row) pair. Returns an empty array when no row-change rules are
 * enabled.
 */
export function detectRowChanges(
  added: ReadonlyArray<{ id: string }>,
  removed: ReadonlyArray<{ id: string }>,
  rules: ReadonlyArray<AlertRule>,
): AlertHit[] {
  const rowRules = rules.filter(
    (r): r is RowChangeRule => r.enabled && r.trigger.kind === 'rowChange',
  );
  if (rowRules.length === 0) return [];

  const hits: AlertHit[] = [];
  const fire = (rule: RowChangeRule, rowId: string) => {
    hits.push({ ruleId: rule.id, rowId, column: null, value: null, prevValue: null });
  };

  for (const rule of rowRules) {
    const target: RowChangeEvent = rule.trigger.event;
    if (target === 'ROW_ADDED') {
      for (const r of added) fire(rule, r.id);
    } else {
      for (const r of removed) fire(rule, r.id);
    }
  }
  return hits;
}

// ─── Message template ──────────────────────────────────────────────────────

/**
 * Substitute `{value}`, `{prev}`, `{rowId}`, `{column}`, and `{rule}` in a
 * rule's `message` template. Missing context yields `''` for that token.
 */
export function renderMessage(template: string, hit: AlertHit, ruleName: string): string {
  return template.replace(/\{(value|prev|rowId|column|rule)\}/g, (_, key) => {
    switch (key) {
      case 'value':
        return formatValue(hit.value);
      case 'prev':
        return formatValue(hit.prevValue);
      case 'rowId':
        return hit.rowId ?? '';
      case 'column':
        return hit.column ?? '';
      case 'rule':
        return ruleName;
      default:
        return '';
    }
  });
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    // Trim trailing zeros without trailing dot.
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)));
  }
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ─── Severity → toast variant lookup (used by the React bridge) ────────────

export const SEVERITY_TO_TOAST_VARIANT: Record<AlertSeverity, 'default' | 'destructive'> = {
  info: 'default',
  success: 'default',
  warning: 'default',
  critical: 'destructive',
};
