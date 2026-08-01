export const PLUS_MINUS_MODULE_ID = 'plus-minus';
export const PLUS_MINUS_SCHEMA_VERSION = 1;

export interface PlusMinusNudgeScope {
  /** Empty = all numeric editable columns. */
  columnIds: string[];
}

export interface PlusMinusNudge {
  id: string;
  name: string;
  enabled: boolean;
  scope: PlusMinusNudgeScope;
  /** When set, nudge applies only when expression is truthy for the row. */
  expression?: string;
  incrementStep: number;
  /** Defaults to incrementStep when omitted. */
  decrementStep?: number;
}

export interface PlusMinusSettings {
  enabled: boolean;
  recordHistory: boolean;
}

export interface PlusMinusState {
  settings: PlusMinusSettings;
  nudges: PlusMinusNudge[];
}

export const INITIAL_PLUS_MINUS: PlusMinusState = {
  settings: {
    enabled: true,
    recordHistory: true,
  },
  nudges: [],
};

function isNudgeScope(raw: unknown): raw is PlusMinusNudgeScope {
  if (!raw || typeof raw !== 'object') return false;
  const columnIds = (raw as PlusMinusNudgeScope).columnIds;
  return Array.isArray(columnIds) && columnIds.every((id) => typeof id === 'string');
}

function parseNudge(raw: unknown): PlusMinusNudge | null {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw as Partial<PlusMinusNudge>;
  if (typeof n.id !== 'string' || typeof n.name !== 'string') return null;
  const incrementStep =
    typeof n.incrementStep === 'number' && Number.isFinite(n.incrementStep) && n.incrementStep > 0
      ? n.incrementStep
      : null;
  if (incrementStep == null) return null;
  const decrementStep =
    n.decrementStep === undefined
      ? undefined
      : typeof n.decrementStep === 'number' && Number.isFinite(n.decrementStep) && n.decrementStep > 0
        ? n.decrementStep
        : undefined;
  const scope = isNudgeScope(n.scope) ? { columnIds: [...n.scope.columnIds] } : { columnIds: [] };
  return {
    id: n.id,
    name: n.name,
    enabled: n.enabled !== false,
    scope,
    expression: typeof n.expression === 'string' ? n.expression : undefined,
    incrementStep,
    decrementStep,
  };
}

export function deserializePlusMinusState(raw: unknown): PlusMinusState {
  if (!raw || typeof raw !== 'object') return structuredClone(INITIAL_PLUS_MINUS);
  const obj = raw as { settings?: Partial<PlusMinusSettings>; nudges?: unknown[] };
  const settings = obj.settings ?? {};
  const nudges = Array.isArray(obj.nudges)
    ? obj.nudges.map(parseNudge).filter((n): n is PlusMinusNudge => n != null)
    : [];
  return {
    settings: {
      enabled: typeof settings.enabled === 'boolean' ? settings.enabled : INITIAL_PLUS_MINUS.settings.enabled,
      recordHistory:
        typeof settings.recordHistory === 'boolean'
          ? settings.recordHistory
          : INITIAL_PLUS_MINUS.settings.recordHistory,
    },
    nudges,
  };
}

export function newPlusMinusNudgeId(): string {
  return `pm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultPlusMinusNudge(name = 'New nudge'): PlusMinusNudge {
  return {
    id: newPlusMinusNudgeId(),
    name,
    enabled: true,
    scope: { columnIds: [] },
    incrementStep: 1,
  };
}
