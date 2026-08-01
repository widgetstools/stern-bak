/**
 * Alerts — expression-driven rules that fire notifications when grid data
 * changes match a trigger. Rules cover three families:
 *
 *   - dataChange      — boolean expression evaluated against the row after a cell value change
 *   - relativeChange  — numeric column moves by PERCENT/ABSOLUTE/ANY delta vs. its previous value
 *   - rowChange       — row added or removed from the grid
 *
 * Notifications are dispatched to two channels (toast + toolbar badge) and
 * recorded in an in-memory history capped by `settings.historyLimit`. The
 * history is NEVER persisted — `serialize` writes `history: []` so opening a
 * saved profile starts with a clean notification list.
 *
 * Module-level settings (frequency, evaluation mode, channel toggles) are
 * persisted alongside rules so users see the same alert behaviour on profile
 * reload.
 */

export type AlertSeverity = 'info' | 'success' | 'warning' | 'critical';

/**
 * Where a fired alert lands.
 *
 *   - `toast`   — transient toast via the host's `useToast` (browser + OpenFin).
 *   - `badge`   — increments the toolbar bell badge + lands in the history popover.
 *   - `openfin` — fires through the OpenFin Workspace Notifications Center
 *     when `window.fin` is detected. No-op in a plain browser. The bridge is
 *     dynamically imported so non-OpenFin apps don't bundle the dependency.
 */
export type AlertChannel = 'toast' | 'badge' | 'openfin';

export type RelativeChangeMode = 'PERCENT_CHANGE' | 'ABSOLUTE_CHANGE' | 'ANY_CHANGE';

export type RelativeChangeDirection = 'up' | 'down' | 'both';

export type RowChangeEvent = 'ROW_ADDED' | 'ROW_REMOVED';

/** Discriminated trigger union. New families add a new `kind` branch. */
export type AlertTrigger =
  | {
      kind: 'dataChange';
      /** Boolean expression evaluated against the current row context. */
      expression: string;
      /** Optional column scope — when set, the rule only fires for changes on this column. */
      column?: string;
    }
  | {
      kind: 'relativeChange';
      column: string;
      mode: RelativeChangeMode;
      /** Required for PERCENT/ABSOLUTE; ignored for ANY_CHANGE. */
      threshold?: number;
      /** Default 'both'. */
      direction?: RelativeChangeDirection;
    }
  | {
      kind: 'rowChange';
      event: RowChangeEvent;
    };

/**
 * Generic over the trigger shape so callers can write
 * `AlertRule<Extract<AlertTrigger, { kind: 'dataChange' }>>` to get a narrowed
 * rule type — TypeScript's `Extract` can't reach into a nested `trigger.kind`
 * discriminant, so the narrowing has to happen at the rule type itself.
 */
export interface AlertRule<T extends AlertTrigger = AlertTrigger> {
  id: string;
  name: string;
  enabled: boolean;
  /** Lower priority fires first when multiple rules match. */
  priority: number;
  severity: AlertSeverity;
  trigger: T;
  /**
   * Message template — `{value}`, `{prev}`, `{rowId}`, `{column}` placeholders
   * are substituted at fire time.
   */
  message: string;
  channels: AlertChannel[];
  /** Per-rule debounce in ms. Falls back to `settings.defaultDebounceMs` when unset. */
  debounceMs?: number;
}

/** Convenience aliases for narrowed rule types — match `Extract<AlertTrigger, ...>` shape. */
export type DataChangeRule = AlertRule<Extract<AlertTrigger, { kind: 'dataChange' }>>;
export type RelativeChangeRule = AlertRule<Extract<AlertTrigger, { kind: 'relativeChange' }>>;
export type RowChangeRule = AlertRule<Extract<AlertTrigger, { kind: 'rowChange' }>>;

export interface AlertNotification {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  /** Already-rendered message (placeholders resolved). */
  message: string;
  rowId: string | null;
  column: string | null;
  value: unknown;
  prevValue: unknown;
  /** `Date.now()` at fire time. */
  firedAt: number;
  read: boolean;
}

export type EvaluationMode = 'realtime' | 'throttled' | 'paused';

export interface AlertsSettings {
  /** Master kill-switch. `false` short-circuits dispatch without detaching listeners. */
  enabled: boolean;
  /** Applied to any rule whose own `debounceMs` is unset. */
  defaultDebounceMs: number;
  /** Global token-bucket cap across ALL rules. */
  maxNotificationsPerSecond: number;
  /** Cap on `history` array length. Oldest pruned when exceeded. */
  historyLimit: number;
  /**
   * Global channel kill-switches; a rule's `channels` array intersects with this set.
   * The `openfin` channel only has effect when `window.fin` is present at runtime
   * — the bridge silently no-ops in non-OpenFin environments.
   */
  enabledChannels: { toast: boolean; badge: boolean; openfin: boolean };
  /**
   * - `realtime` — every `cellValueChanged` evaluates immediately.
   * - `throttled` — coalesce evaluations to one batch per animation frame.
   * - `paused` — stop new evaluations; preserves history and rule definitions.
   */
  evaluationMode: EvaluationMode;
}

export interface AlertsState {
  rules: AlertRule[];
  history: AlertNotification[];
  settings: AlertsSettings;
}

export const DEFAULT_ALERTS_SETTINGS: AlertsSettings = {
  enabled: true,
  defaultDebounceMs: 1000,
  maxNotificationsPerSecond: 5,
  historyLimit: 500,
  enabledChannels: { toast: true, badge: true, openfin: true },
  evaluationMode: 'realtime',
};

export const INITIAL_ALERTS: AlertsState = {
  rules: [],
  history: [],
  settings: { ...DEFAULT_ALERTS_SETTINGS },
};

// ─── Deserialise ───────────────────────────────────────────────────────────

const KNOWN_TRIGGER_KINDS = new Set<AlertTrigger['kind']>([
  'dataChange',
  'relativeChange',
  'rowChange',
]);

const KNOWN_SEVERITIES = new Set<AlertSeverity>(['info', 'success', 'warning', 'critical']);

const KNOWN_CHANNELS = new Set<AlertChannel>(['toast', 'badge', 'openfin']);

const KNOWN_EVAL_MODES = new Set<EvaluationMode>(['realtime', 'throttled', 'paused']);

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object';
}

function coerceString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function coerceNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function coerceBoolean(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function coerceTrigger(raw: unknown): AlertTrigger | null {
  if (!isObject(raw)) return null;
  const kind = raw.kind as AlertTrigger['kind'];
  if (!KNOWN_TRIGGER_KINDS.has(kind)) return null;
  if (kind === 'dataChange') {
    const expression = coerceString(raw.expression);
    if (!expression) return null;
    const column = typeof raw.column === 'string' ? raw.column : undefined;
    return { kind, expression, ...(column !== undefined ? { column } : {}) };
  }
  if (kind === 'relativeChange') {
    const column = coerceString(raw.column);
    if (!column) return null;
    const mode = raw.mode as RelativeChangeMode;
    if (!['PERCENT_CHANGE', 'ABSOLUTE_CHANGE', 'ANY_CHANGE'].includes(mode)) return null;
    const threshold =
      typeof raw.threshold === 'number' && Number.isFinite(raw.threshold)
        ? raw.threshold
        : undefined;
    const direction =
      raw.direction === 'up' || raw.direction === 'down' || raw.direction === 'both'
        ? raw.direction
        : undefined;
    return {
      kind,
      column,
      mode,
      ...(threshold !== undefined ? { threshold } : {}),
      ...(direction !== undefined ? { direction } : {}),
    };
  }
  // rowChange
  const event = raw.event as RowChangeEvent;
  if (event !== 'ROW_ADDED' && event !== 'ROW_REMOVED') return null;
  return { kind, event };
}

function coerceRule(raw: unknown): AlertRule | null {
  if (!isObject(raw)) return null;
  const id = coerceString(raw.id);
  const name = coerceString(raw.name);
  if (!id || !name) return null;
  const trigger = coerceTrigger(raw.trigger);
  if (!trigger) return null;
  const severity = KNOWN_SEVERITIES.has(raw.severity as AlertSeverity)
    ? (raw.severity as AlertSeverity)
    : 'info';
  const channels: AlertChannel[] = Array.isArray(raw.channels)
    ? (raw.channels.filter(
        (c: unknown): c is AlertChannel =>
          typeof c === 'string' && KNOWN_CHANNELS.has(c as AlertChannel),
      ))
    : ['toast', 'badge'];
  return {
    id,
    name,
    enabled: coerceBoolean(raw.enabled, true),
    priority: coerceNumber(raw.priority, 0),
    severity,
    trigger,
    message: coerceString(raw.message, name),
    channels: channels.length > 0 ? channels : ['toast', 'badge'],
    ...(typeof raw.debounceMs === 'number' && raw.debounceMs >= 0
      ? { debounceMs: raw.debounceMs }
      : {}),
  };
}

function coerceSettings(raw: unknown): AlertsSettings {
  if (!isObject(raw)) return { ...DEFAULT_ALERTS_SETTINGS };
  const enabledChannelsRaw = isObject(raw.enabledChannels) ? raw.enabledChannels : {};
  const evalMode = KNOWN_EVAL_MODES.has(raw.evaluationMode as EvaluationMode)
    ? (raw.evaluationMode as EvaluationMode)
    : DEFAULT_ALERTS_SETTINGS.evaluationMode;
  return {
    enabled: coerceBoolean(raw.enabled, DEFAULT_ALERTS_SETTINGS.enabled),
    defaultDebounceMs: Math.max(
      0,
      coerceNumber(raw.defaultDebounceMs, DEFAULT_ALERTS_SETTINGS.defaultDebounceMs),
    ),
    maxNotificationsPerSecond: Math.max(
      1,
      coerceNumber(raw.maxNotificationsPerSecond, DEFAULT_ALERTS_SETTINGS.maxNotificationsPerSecond),
    ),
    historyLimit: Math.max(
      1,
      coerceNumber(raw.historyLimit, DEFAULT_ALERTS_SETTINGS.historyLimit),
    ),
    enabledChannels: {
      toast: coerceBoolean(enabledChannelsRaw.toast, true),
      badge: coerceBoolean(enabledChannelsRaw.badge, true),
      openfin: coerceBoolean(enabledChannelsRaw.openfin, true),
    },
    evaluationMode: evalMode,
  };
}

/**
 * Defensive deserialiser. Drops malformed rules silently and merges raw
 * settings over defaults so older profiles round-trip without crashing.
 * Always returns an empty `history` — runtime never persists notifications.
 */
export function deserializeAlertsState(raw: unknown): AlertsState {
  if (!isObject(raw)) return { ...INITIAL_ALERTS, settings: { ...DEFAULT_ALERTS_SETTINGS } };
  const rulesRaw = Array.isArray(raw.rules) ? raw.rules : [];
  const rules = rulesRaw
    .map(coerceRule)
    .filter((r): r is AlertRule => r !== null);
  return {
    rules,
    history: [],
    settings: coerceSettings(raw.settings),
  };
}

/** Cap an array of notifications to a maximum length, keeping the most recent. */
export function capHistory(
  history: AlertNotification[],
  limit: number,
): AlertNotification[] {
  if (history.length <= limit) return history;
  return history.slice(0, limit);
}
