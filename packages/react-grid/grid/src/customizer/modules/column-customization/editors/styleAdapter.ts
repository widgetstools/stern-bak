import type { StyleEditorValue } from '../../../ui/StyleEditor';
import type {
  BorderSpec,
  CellStyleOverrides,
  ColumnAssignment,
} from '../state';

/**
 * Bridges between the panel's flat `CellStyleOverrides` shape and the
 * StyleEditor's `StyleEditorValue` shape, plus a couple of small helpers
 * that read the assignment as a whole. Lifted out of ColumnSettingsPanel.tsx
 * so the editor file stays focused on its render tree.
 */

export function toStyleEditorValue(o: CellStyleOverrides | undefined): StyleEditorValue {
  if (!o) return {};
  const borders: StyleEditorValue['borders'] = {};
  let hasAnyBorder = false;
  if (o.borders) {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const spec = o.borders[side];
      if (spec) {
        borders[side] = spec;
        hasAnyBorder = true;
      }
    }
  }
  return {
    bold: o.typography?.bold,
    italic: o.typography?.italic,
    underline: o.typography?.underline,
    fontSize: o.typography?.fontSize,
    align: o.alignment?.horizontal as StyleEditorValue['align'],
    color: o.colors?.text,
    backgroundColor: o.colors?.background,
    borders: hasAnyBorder ? borders : undefined,
  };
}

export function fromStyleEditorValue(v: StyleEditorValue): CellStyleOverrides | undefined {
  const typography = pruneUndefined({
    bold: v.bold,
    italic: v.italic,
    underline: v.underline,
    fontSize: v.fontSize,
  });
  const colors = pruneUndefined({ text: v.color, background: v.backgroundColor });
  const alignment = pruneUndefined({ horizontal: v.align });
  const borders = pickBorders(v.borders);
  const out: CellStyleOverrides = {};
  if (typography) out.typography = typography as CellStyleOverrides['typography'];
  if (colors) out.colors = colors as CellStyleOverrides['colors'];
  if (alignment) out.alignment = alignment as CellStyleOverrides['alignment'];
  if (borders) out.borders = borders;
  return Object.keys(out).length > 0 ? out : undefined;
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val !== undefined) out[k] = val;
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

function pickBorders(
  b: StyleEditorValue['borders'],
): CellStyleOverrides['borders'] | undefined {
  if (!b) return undefined;
  const out: Record<string, BorderSpec> = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const spec = b[side];
    if (spec && spec.width > 0) out[side] = spec;
  }
  return Object.keys(out).length > 0 ? (out as CellStyleOverrides['borders']) : undefined;
}

/**
 * True when an assignment has only its required `colId` and no actual
 * overrides — used by the commit path so saving an untouched draft
 * doesn't pollute state with `{ colId }`-only entries.
 */
export function isEmptyAssignment(a: ColumnAssignment): boolean {
  return Object.keys(a).every(
    (k) => k === 'colId' || a[k as keyof ColumnAssignment] === undefined,
  );
}

/** Count of override fields populated on the assignment. */
export function countOverrides(a: ColumnAssignment): number {
  let n = 0;
  for (const k of Object.keys(a)) {
    if (k === 'colId') continue;
    if (a[k as keyof ColumnAssignment] !== undefined) n++;
  }
  return n;
}
