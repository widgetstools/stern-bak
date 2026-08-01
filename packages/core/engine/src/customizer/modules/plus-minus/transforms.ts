import type { AnyColDef } from '../../../platform/types.js';
import { isNumericCellDataType } from '../smart-edit/isNumericCellDataType.js';

const NUDGE_KEYS = new Set(['+', '=', '-']);

export function applyPlusMinusColDefTransforms(defs: AnyColDef[]): AnyColDef[] {
  return defs.map((def) => applyToDef(def));
}

function applyToDef(def: AnyColDef): AnyColDef {
  if ('children' in def && Array.isArray(def.children)) {
    const next = def.children.map((c) => applyToDef(c));
    const unchanged = next.every((c, i) => c === def.children![i]);
    return unchanged ? def : { ...def, children: next };
  }
  return wrapWithNudgeKeySuppress(def);
}

/** Prevent AG Grid from starting inline edit on +/- keys — handled by plus-minus activate. */
function wrapWithNudgeKeySuppress(def: AnyColDef): AnyColDef {
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
      return NUDGE_KEYS.has(params.event.key);
    },
  };
}
