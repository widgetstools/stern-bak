import type { ShortcutDefinition } from './state.js';

export interface ShortcutCellContext {
  colId: string;
  field: string;
}

function columnInScope(shortcut: ShortcutDefinition, colId: string, field: string): boolean {
  const ids = shortcut.scope.columnIds;
  if (ids.length === 0) return true;
  return ids.includes(colId) || ids.includes(field);
}

function normalizeKey(key: string): string | null {
  if (key.length !== 1) return null;
  if (!/^[a-zA-Z]$/.test(key)) return null;
  return key.toLowerCase();
}

/** First matching enabled shortcut for key + column (profile order). */
export function matchShortcutForCell(
  cell: ShortcutCellContext,
  key: string,
  shortcuts: readonly ShortcutDefinition[],
): ShortcutDefinition | null {
  const k = normalizeKey(key);
  if (!k) return null;
  for (const shortcut of shortcuts) {
    if (!shortcut.enabled) continue;
    if (shortcut.shortcutKey.toLowerCase() !== k) continue;
    if (!columnInScope(shortcut, cell.colId, cell.field)) continue;
    return shortcut;
  }
  return null;
}

/** Collect configured letter keys for suppressKeyboardEvent transforms. */
export function collectShortcutKeys(shortcuts: readonly ShortcutDefinition[]): Set<string> {
  const keys = new Set<string>();
  for (const s of shortcuts) {
    if (!s.enabled) continue;
    const k = s.shortcutKey?.trim();
    if (k?.length === 1 && /^[a-zA-Z]$/.test(k)) keys.add(k.toLowerCase());
  }
  return keys;
}
