/**
 * "Tell me when…" as one obvious tool.
 *
 * The alerts engine has been complete for a while — expression evaluation,
 * relative-change deltas, row add/remove, debouncing, a toast bridge and an
 * OpenFin Notification Center bridge. What was missing was a way for a model to
 * reach it. The only route was `add_module_item` on moduleId "alerts",
 * collection "rules", carrying a hand-written rule object; a model asked to
 * "let me know if any spread blows out" does not go looking for a tool called
 * *add module item*, for the same reason `rename_column` had to exist next to
 * `set_column_style`.
 *
 * Worse, the shape it would have copied was wrong. The alerts feature guide
 * documented a `dataChange` trigger as
 * `{ kind, column, operator: "greaterThan", value: 50 }`, but the trigger type
 * is `{ kind, expression, column? }` and `evaluateDataChangeRule` calls
 * `parseAndEvaluate(trigger.expression, …)`. An `operator`/`value` rule leaves
 * `expression` undefined, the parse throws, the evaluator swallows it — and the
 * alert saves cleanly and never fires. Nothing surfaces that.
 *
 * So this takes the three trigger families in the terms people state them and
 * compiles each into a trigger the runtime actually evaluates. The expression
 * escape hatch stays for anything the shorthands can't say.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { patchGridModule, describeFanOut, resolveGridEntry } from './gridProfiles';
import { readColumnCatalogue, resolveColumn } from './columnResolver';
import type { ToolExecutionResult } from './toolResult';

const SEVERITIES = ['info', 'success', 'warning', 'critical'] as const;
const CHANNELS = ['toast', 'badge', 'openfin'] as const;

/** Comparison shorthands → the expression operator they compile to. */
const OPERATORS: Record<string, string> = {
  gt: '>', greaterThan: '>', above: '>',
  gte: '>=', greaterThanOrEqual: '>=',
  lt: '<', lessThan: '<', below: '<',
  lte: '<=', lessThanOrEqual: '<=',
  eq: '==', equals: '==',
  ne: '!=', notEquals: '!=',
};

const MODES: Record<string, 'PERCENT_CHANGE' | 'ABSOLUTE_CHANGE' | 'ANY_CHANGE'> = {
  percent: 'PERCENT_CHANGE',
  absolute: 'ABSOLUTE_CHANGE',
  any: 'ANY_CHANGE',
};

interface AlertArgs {
  targetGridId?: string;
  name?: string;
  column?: string;
  operator?: string;
  value?: unknown;
  movesBy?: number;
  mode?: string;
  direction?: 'up' | 'down' | 'both';
  rowEvent?: 'added' | 'removed';
  expression?: string;
  message?: string;
  severity?: string;
  channels?: string[];
  debounceMs?: number;
  priority?: number;
  enabled?: boolean;
}

type Trigger =
  | { kind: 'dataChange'; expression: string; column?: string }
  | { kind: 'relativeChange'; column: string; mode: string; threshold?: number; direction?: string }
  | { kind: 'rowChange'; event: 'ROW_ADDED' | 'ROW_REMOVED' };

/**
 * A literal for the expression language: numbers bare, everything else quoted.
 * An unquoted string would parse as a column reference and silently compare the
 * cell against null.
 */
function literal(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

/** Which of the three families the caller described, or an error naming the conflict. */
function buildTrigger(a: AlertArgs, colId: string | undefined): Trigger | string {
  const forms = [
    a.rowEvent !== undefined ? 'rowEvent' : null,
    a.operator !== undefined || a.value !== undefined ? 'threshold' : null,
    a.movesBy !== undefined || a.mode !== undefined ? 'relative' : null,
    a.expression !== undefined ? 'expression' : null,
  ].filter(Boolean) as string[];

  if (forms.length === 0) {
    return 'Nothing to alert on. Pass one of: operator + value (a threshold), movesBy + mode (a relative move), rowEvent (rows appearing/disappearing), or expression (anything else).';
  }
  if (forms.length > 1) {
    return `Pass only one trigger — got ${forms.join(' and ')}. Each alert watches one thing; make a second alert for the other.`;
  }

  if (a.rowEvent !== undefined) {
    if (a.rowEvent !== 'added' && a.rowEvent !== 'removed') {
      return 'rowEvent must be "added" or "removed".';
    }
    return { kind: 'rowChange', event: a.rowEvent === 'added' ? 'ROW_ADDED' : 'ROW_REMOVED' };
  }

  if (a.expression !== undefined) {
    if (typeof a.expression !== 'string' || !a.expression.trim()) {
      return 'expression must be a non-empty boolean expression, e.g. "value > 50" or "[bid] > [ask]".';
    }
    return { kind: 'dataChange', expression: a.expression, ...(colId ? { column: colId } : {}) };
  }

  if (!colId) return 'This alert needs a column — name the column whose value should be watched.';

  if (a.operator !== undefined || a.value !== undefined) {
    if (a.operator === undefined || a.value === undefined) {
      return 'A threshold needs both operator and value, e.g. operator: "gt", value: 50.';
    }
    const op = OPERATORS[a.operator];
    if (!op) {
      return `operator "${a.operator}" is not one of: ${Object.keys(OPERATORS).join(', ')}.`;
    }
    // `value` is the changed cell's own value in the evaluation context, and
    // the trigger is column-scoped, so this reads the right cell without the
    // rule having to name it twice.
    return { kind: 'dataChange', expression: `value ${op} ${literal(a.value)}`, column: colId };
  }

  const mode = MODES[a.mode ?? 'percent'];
  if (!mode) return `mode must be one of: ${Object.keys(MODES).join(', ')}.`;
  if (mode !== 'ANY_CHANGE' && (typeof a.movesBy !== 'number' || !Number.isFinite(a.movesBy))) {
    return 'A relative alert needs movesBy — the size of the move, e.g. movesBy: 10 with mode: "percent". Use mode: "any" to fire on any change at all.';
  }
  return {
    kind: 'relativeChange',
    column: colId,
    mode,
    ...(mode === 'ANY_CHANGE' ? {} : { threshold: a.movesBy }),
    direction: a.direction ?? 'both',
  };
}

/** Readable default so a rule without a message still says something useful. */
function defaultMessage(trigger: Trigger, colId: string | undefined): string {
  if (trigger.kind === 'rowChange') {
    return trigger.event === 'ROW_ADDED' ? 'New row {rowId}' : 'Row {rowId} dropped out';
  }
  if (trigger.kind === 'relativeChange') return '{column} on {rowId} moved to {value} (was {prev})';
  return colId ? '{column} on {rowId} is {value}' : 'Alert fired on {rowId}';
}

function slug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `alert-${base || 'rule'}`;
}

export async function createAlert(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const a = args as AlertArgs;
  if (!a.targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  if (!a.name || typeof a.name !== 'string' || !a.name.trim()) {
    return { ok: false, summary: 'Missing required field: name — what to call this alert, e.g. "Spread blew out".' };
  }
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) {
    return { ok: false, summary: `No grid registered with id "${a.targetGridId}". Call list_grids to see valid ids.` };
  }

  // Resolved the same way every column tool resolves one, so the user can say
  // "market value" rather than having to know the colId.
  let colId: string | undefined;
  if (a.column !== undefined) {
    const catalogue = await readColumnCatalogue(configManager, configStore, entry);
    const match = resolveColumn(a.column, catalogue);
    if (!match.ok) return { ok: false, summary: match.error };
    colId = match.colId;
  }

  const trigger = buildTrigger(a, colId);
  if (typeof trigger === 'string') return { ok: false, summary: trigger };

  if (a.severity !== undefined && !(SEVERITIES as readonly string[]).includes(a.severity)) {
    return { ok: false, summary: `severity must be one of: ${SEVERITIES.join(', ')}.` };
  }
  if (a.channels !== undefined) {
    if (!Array.isArray(a.channels) || a.channels.some((c) => !(CHANNELS as readonly string[]).includes(c))) {
      return { ok: false, summary: `channels must be an array of: ${CHANNELS.join(', ')}.` };
    }
    if (a.channels.length === 0) return { ok: false, summary: 'channels cannot be empty — an alert with nowhere to go never reaches anyone.' };
  }

  const rule = {
    id: slug(a.name),
    name: a.name,
    enabled: a.enabled ?? true,
    priority: a.priority ?? 10,
    severity: a.severity ?? 'warning',
    trigger,
    message: a.message ?? defaultMessage(trigger, colId),
    // Both bridges are already wired; `openfin` is a no-op outside OpenFin, so
    // asking for it costs nothing in the browser and is what makes an alert
    // reach someone who is not looking at the blotter.
    channels: a.channels ?? ['toast', 'badge', 'openfin'],
    // On a live feed an undebounced rule is a firehose. The module default is
    // 1s; a threshold that is true for as long as the price stays there would
    // re-fire on every tick, so this leans slower.
    debounceMs: a.debounceMs ?? 5000,
  };

  const fan = await patchGridModule(configManager, entry, 'alerts', (prev) => {
    const prevState = (prev as { rules?: Array<{ id: string }> } | undefined) ?? {};
    const rules = (prevState.rules ?? []).filter((r) => r.id !== rule.id);
    return { ...prevState, rules: [...rules, rule] };
  });

  return {
    ok: true,
    summary:
      `Alert "${rule.name}" (${rule.id}) on "${entry.displayName}"${describeFanOut(fan)}: ` +
      `${describeTrigger(trigger)}, ${rule.severity}, via ${rule.channels.join(' + ')}, debounced ${rule.debounceMs}ms.`,
    data: rule,
  };
}

/** Says back what will actually fire, in the terms the runtime will use. */
function describeTrigger(trigger: Trigger): string {
  if (trigger.kind === 'rowChange') {
    return trigger.event === 'ROW_ADDED' ? 'fires when a row appears' : 'fires when a row drops out';
  }
  if (trigger.kind === 'relativeChange') {
    const dir = trigger.direction && trigger.direction !== 'both' ? ` ${trigger.direction}` : '';
    return trigger.mode === 'ANY_CHANGE'
      ? `fires on any change to ${trigger.column}`
      : `fires when ${trigger.column} moves${dir} by ${trigger.threshold}${trigger.mode === 'PERCENT_CHANGE' ? '%' : ''}`;
  }
  return `fires when ${trigger.expression}`;
}
