import type { BorderSpec } from '../../../colDef/types.js';
import type { CellStyleProperties, ThemeAwareStyle } from '../../../types/common.js';
import type { StyleEditorValue } from '../../../styleEditor/types.js';

/**
 * Bridge: flat `CellStyleProperties` (ThemeAwareStyle.light) ↔
 * semantic `StyleEditorValue`.
 *
 * Conditional-styling rules persist text / border / format identical
 * across light & dark themes; only backgroundColor differs per theme.
 * The shared StyleEditor edits one value, and the panel writes the
 * same patch into both theme slices.
 */

type BorderSide = 'top' | 'right' | 'bottom' | 'left';

const SIDES: Array<[BorderSide, 'Top' | 'Right' | 'Bottom' | 'Left']> = [
  ['top', 'Top'],
  ['right', 'Right'],
  ['bottom', 'Bottom'],
  ['left', 'Left'],
];

function parseBorderStyle(s: string | undefined): BorderSpec['style'] {
  return s === 'dashed' || s === 'dotted' ? s : 'solid';
}

function readBorder(light: CellStyleProperties, upper: 'Top' | 'Right' | 'Bottom' | 'Left'): BorderSpec | undefined {
  const w = light[`border${upper}Width` as keyof CellStyleProperties] as string | undefined;
  if (!w) return undefined;
  const width = parseInt(w, 10);
  if (!Number.isFinite(width) || width <= 0) return undefined;
  const color = (light[`border${upper}Color` as keyof CellStyleProperties] as string | undefined) ?? '#000000';
  const style = parseBorderStyle(light[`border${upper}Style` as keyof CellStyleProperties] as string | undefined);
  return { width, color, style };
}

export function toStyleEditorValue(theme: ThemeAwareStyle): StyleEditorValue {
  const light = theme.light ?? {};
  const borders: StyleEditorValue['borders'] = {};
  let hasAnyBorder = false;
  for (const [lower, upper] of SIDES) {
    const spec = readBorder(light, upper);
    if (spec) {
      borders[lower] = spec;
      hasAnyBorder = true;
    }
  }

  const fontSizePx = light.fontSize ? parseInt(light.fontSize, 10) : undefined;
  const weightNum = light.fontWeight ? Number(light.fontWeight) : undefined;

  return {
    bold: light.fontWeight === '700' || light.fontWeight === 'bold',
    italic: light.fontStyle === 'italic',
    underline: light.textDecoration === 'underline',
    strikethrough: light.textDecoration === 'line-through',
    align:
      light.textAlign === 'left' || light.textAlign === 'center' ||
      light.textAlign === 'right' || light.textAlign === 'justify'
        ? light.textAlign
        : undefined,
    fontSize: Number.isFinite(fontSizePx) && fontSizePx ? fontSizePx : undefined,
    fontWeight: ([400, 500, 600, 700] as const).includes(weightNum as 400 | 500 | 600 | 700)
      ? (weightNum as 400 | 500 | 600 | 700)
      : undefined,
    color: light.color,
    backgroundColor: (theme.dark?.backgroundColor ?? light.backgroundColor) || undefined,
    backgroundAlpha: 100,
    borders: hasAnyBorder ? borders : undefined,
  };
}

function stripUndef(obj: CellStyleProperties): CellStyleProperties {
  const out: Record<string, string | undefined> = { ...obj };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as CellStyleProperties;
}

/**
 * Apply a StyleEditorValue to a ThemeAwareStyle. Text/border/align/size go
 * into BOTH themes identically. backgroundColor lands on both themes —
 * the UI exposes a single picker, but downstream code reads
 * `style.light.backgroundColor` and `style.dark.backgroundColor`
 * separately, so we replicate the single value into each slice.
 */
export function fromStyleEditorValue(
  previous: ThemeAwareStyle,
  value: StyleEditorValue,
): ThemeAwareStyle {
  const patch: Partial<CellStyleProperties> = {};

  patch.fontWeight = value.bold ? '700' : value.fontWeight ? String(value.fontWeight) : undefined;
  patch.fontStyle = value.italic ? 'italic' : undefined;
  patch.textDecoration = value.underline
    ? 'underline'
    : value.strikethrough
      ? 'line-through'
      : undefined;
  patch.textAlign = value.align;
  patch.fontSize = value.fontSize ? `${value.fontSize}px` : undefined;
  patch.color = value.color;
  patch.backgroundColor = value.backgroundColor;

  // Borders — overwrite ALL four sides from value.borders (undefined side means no border).
  for (const [lower, upper] of SIDES) {
    const spec = value.borders?.[lower];
    const wKey = `border${upper}Width` as keyof CellStyleProperties;
    const sKey = `border${upper}Style` as keyof CellStyleProperties;
    const cKey = `border${upper}Color` as keyof CellStyleProperties;
    if (spec && spec.width > 0) {
      (patch as Record<string, string>)[wKey as string] = `${spec.width}px`;
      (patch as Record<string, string>)[sKey as string] = spec.style;
      (patch as Record<string, string>)[cKey as string] = spec.color;
    } else {
      (patch as Record<string, undefined>)[wKey as string] = undefined;
      (patch as Record<string, undefined>)[sKey as string] = undefined;
      (patch as Record<string, undefined>)[cKey as string] = undefined;
    }
  }

  const mergedLight = stripUndef({ ...(previous.light ?? {}), ...patch });
  const mergedDark = stripUndef({ ...(previous.dark ?? {}), ...patch });

  return { light: mergedLight, dark: mergedDark };
}
