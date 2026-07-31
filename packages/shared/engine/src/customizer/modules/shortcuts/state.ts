import type { SmartEditOp } from '../smart-edit/state.js';

export const SHORTCUTS_MODULE_ID = 'shortcuts';
export const SHORTCUTS_SCHEMA_VERSION = 1;

export type ShortcutOperation = Extract<SmartEditOp, 'add' | 'subtract' | 'multiply' | 'divide'>;

export interface ShortcutScope {
  /** Empty = all numeric editable columns. */
  columnIds: string[];
}

export interface ShortcutDefinition {
  id: string;
  name: string;
  enabled: boolean;
  /** Single letter key (case-insensitive). */
  shortcutKey: string;
  operation: ShortcutOperation;
  shortcutValue: number;
  scope: ShortcutScope;
}

export interface ShortcutsSettings {
  enabled: boolean;
  recordHistory: boolean;
}

export interface ShortcutsState {
  settings: ShortcutsSettings;
  shortcuts: ShortcutDefinition[];
}

export const INITIAL_SHORTCUTS: ShortcutsState = {
  settings: {
    enabled: true,
    recordHistory: true,
  },
  shortcuts: [],
};

function isScope(raw: unknown): raw is ShortcutScope {
  if (!raw || typeof raw !== 'object') return false;
  const columnIds = (raw as ShortcutScope).columnIds;
  return Array.isArray(columnIds) && columnIds.every((id) => typeof id === 'string');
}

function parseOperation(raw: unknown): ShortcutOperation | null {
  if (raw === 'add' || raw === 'subtract' || raw === 'multiply' || raw === 'divide') return raw;
  return null;
}

function parseShortcut(raw: unknown): ShortcutDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<ShortcutDefinition>;
  if (typeof s.id !== 'string' || typeof s.name !== 'string') return null;
  const key = typeof s.shortcutKey === 'string' ? s.shortcutKey.trim() : '';
  if (key.length !== 1 || !/^[a-zA-Z]$/.test(key)) return null;
  const op = parseOperation(s.operation);
  if (!op) return null;
  const shortcutValue =
    typeof s.shortcutValue === 'number' && Number.isFinite(s.shortcutValue) ? s.shortcutValue : null;
  if (shortcutValue == null) return null;
  const scope = isScope(s.scope) ? { columnIds: [...s.scope.columnIds] } : { columnIds: [] };
  return {
    id: s.id,
    name: s.name,
    enabled: s.enabled !== false,
    shortcutKey: key.toLowerCase(),
    operation: op,
    shortcutValue,
    scope,
  };
}

export function deserializeShortcutsState(raw: unknown): ShortcutsState {
  if (!raw || typeof raw !== 'object') return structuredClone(INITIAL_SHORTCUTS);
  const obj = raw as { settings?: Partial<ShortcutsSettings>; shortcuts?: unknown[] };
  const settings = obj.settings ?? {};
  const shortcuts = Array.isArray(obj.shortcuts)
    ? obj.shortcuts.map(parseShortcut).filter((s): s is ShortcutDefinition => s != null)
    : [];
  return {
    settings: {
      enabled: typeof settings.enabled === 'boolean' ? settings.enabled : INITIAL_SHORTCUTS.settings.enabled,
      recordHistory:
        typeof settings.recordHistory === 'boolean'
          ? settings.recordHistory
          : INITIAL_SHORTCUTS.settings.recordHistory,
    },
    shortcuts,
  };
}

export function newShortcutId(): string {
  return `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultShortcut(name = 'New shortcut'): ShortcutDefinition {
  return {
    id: newShortcutId(),
    name,
    enabled: true,
    shortcutKey: 'h',
    operation: 'multiply',
    shortcutValue: 100,
    scope: { columnIds: [] },
  };
}
