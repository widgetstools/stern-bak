import type { AnyColDef } from '../../../platform/types.js';
import { parseMagnitudeSuffix } from './parseMagnitudeSuffix.js';
import { isNumericCellDataType } from './isNumericCellDataType.js';

export function applySmartEditColDefTransforms(
  defs: AnyColDef[],
  magnitudeShortcutsEnabled: boolean,
): AnyColDef[] {
  if (!magnitudeShortcutsEnabled) return defs;
  return defs.map((def) => applyToDef(def));
}

function applyToDef(def: AnyColDef): AnyColDef {
  if ('children' in def && Array.isArray(def.children)) {
    const next = def.children.map((c) => applyToDef(c));
    const unchanged = next.every((c, i) => c === def.children![i]);
    return unchanged ? def : { ...def, children: next };
  }
  return wrapWithMagnitudeParser(def);
}

function wrapWithMagnitudeParser(def: AnyColDef): AnyColDef {
  const col = def as {
    editable?: boolean;
    cellDataType?: string;
    valueParser?: (params: { newValue: unknown }) => unknown;
  };
  if (col.editable === false) return def;
  if (col.cellDataType && !isNumericCellDataType(col.cellDataType)) return def;

  const prev = col.valueParser;
  return {
    ...def,
    valueParser: (params: { newValue: unknown }) => {
      const parsed = parseMagnitudeSuffix(String(params.newValue ?? ''));
      if (parsed !== null) return parsed;
      return typeof prev === 'function' ? prev(params) : params.newValue;
    },
  };
}
