import type { AnyColDef } from '../../../platform/types.js';
import { isNumericCellDataType } from '../smart-edit/isNumericCellDataType.js';
import { collectShortcutKeys } from './matchShortcut.js';
import type { ShortcutDefinition } from './state.js';

export function applyShortcutsColDefTransforms(
  defs: AnyColDef[],
  shortcuts: readonly ShortcutDefinition[],
): AnyColDef[] {
  const keys = collectShortcutKeys(shortcuts);
  if (keys.size === 0) return defs;
  return defs.map((def) => applyToDef(def, keys));
}

function applyToDef(def: AnyColDef, keys: Set<string>): AnyColDef {
  if ('children' in def && Array.isArray(def.children)) {
    const next = def.children.map((c) => applyToDef(c, keys));
    const unchanged = next.every((c, i) => c === def.children![i]);
    return unchanged ? def : { ...def, children: next };
  }
  return wrapWithShortcutKeySuppress(def, keys);
}

/** Prevent AG Grid from starting inline edit on configured shortcut letter keys. */
function wrapWithShortcutKeySuppress(def: AnyColDef, keys: Set<string>): AnyColDef {
  const col = def as {
    editable?: boolean;
    cellDataType?: string;
    suppressKeyboardEvent?: (params: { event: KeyboardEvent; editing: boolean }) => boolean;
  };
  if (col.editable === false) return def;
  if (col.cellDataType && !isNumericCellDataType(col.cellDataType)) return def;

  const prev = col.suppressKeyboardEvent;
  return {
    ...def,
    suppressKeyboardEvent: (params) => {
      if (typeof prev === 'function' && prev(params)) return true;
      if (params.editing) return false;
      const k = params.event.key.length === 1 ? params.event.key.toLowerCase() : '';
      return k.length === 1 && keys.has(k);
    },
  };
}
