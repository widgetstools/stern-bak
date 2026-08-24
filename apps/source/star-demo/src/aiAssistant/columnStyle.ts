/**
 * Argument handling for `set_column_style`.
 *
 * Three things make this more than a property copy:
 *
 *  1. **Cells vs headers.** A column carries TWO independent themed style
 *     slots — `cellStyleOverrides` and `headerStyleOverrides`. Aligning a
 *     column's values does nothing to its header, which is why "right-align
 *     the columns" only ever half-worked without an explicit target.
 *  2. **Themed slots.** Colours persist per theme (`dark` / `light`), but
 *     alignment and typography are theme-independent, so they're written to
 *     BOTH slots — otherwise flipping the theme drops the alignment.
 *  3. **One column, several, or all.** "Right-align every column" is one
 *     `globalCellStyle` write, not twenty per-column writes; the engine
 *     layers global → per-column, so per-column settings still win.
 */
import type { CellStyleOverrides, ThemedCellStyleOverrides } from '@wellsfargo-starui/core';

export type StyleTarget = 'cells' | 'headers' | 'cells+headers';
export type HorizontalAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';
export type FormatPreset = 'currency' | 'percent' | 'number' | 'date' | 'datetime' | 'duration';

export const STYLE_TARGETS = ['cells', 'headers', 'cells+headers'] as const;
export const HORIZONTAL_ALIGNS = ['left', 'center', 'right'] as const;
export const VERTICAL_ALIGNS = ['top', 'middle', 'bottom'] as const;
export const FORMAT_PRESETS = ['currency', 'percent', 'number', 'date', 'datetime', 'duration'] as const;

export interface ThemeColors {
  text?: string;
  background?: string;
}

export interface NormalizedColumnStyle {
  /** Empty when `allColumns` is set. */
  colIds: string[];
  allColumns: boolean;
  target: StyleTarget;
  align?: HorizontalAlign;
  verticalAlign?: VerticalAlign;
  colors?: { light?: ThemeColors; dark?: ThemeColors };
  bold?: boolean;
  italic?: boolean;
  formatPreset?: FormatPreset;
  /** True when the call carries nothing to apply — caught as an error. */
  isEmpty: boolean;
}

export type ColumnStyleResult =
  | { ok: true; value: NormalizedColumnStyle }
  | { ok: false; error: string };

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined | { error: string } {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  return { error: `${field} must be one of: ${allowed.join(', ')}. Got ${JSON.stringify(value)}.` };
}

function isError(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v;
}

export function normalizeColumnStyleArgs(args: Record<string, unknown>): ColumnStyleResult {
  const rawIds = args.colIds;
  const colIds: string[] = [];
  if (typeof args.colId === 'string' && args.colId) colIds.push(args.colId);
  if (Array.isArray(rawIds)) {
    for (const id of rawIds) {
      if (typeof id !== 'string' || !id) return { ok: false, error: 'colIds must be an array of column-id strings.' };
      if (!colIds.includes(id)) colIds.push(id);
    }
  } else if (rawIds !== undefined) {
    return { ok: false, error: 'colIds must be an array of column-id strings.' };
  }

  const allColumns = args.allColumns === true;
  if (args.allColumns !== undefined && typeof args.allColumns !== 'boolean') {
    return { ok: false, error: 'allColumns must be a boolean.' };
  }
  if (allColumns && colIds.length > 0) {
    return { ok: false, error: 'Pass either allColumns:true or colId/colIds — not both.' };
  }
  if (!allColumns && colIds.length === 0) {
    return { ok: false, error: 'Missing target column(s): pass colId, colIds, or allColumns:true.' };
  }

  const target = oneOf<StyleTarget>(args.target, STYLE_TARGETS, 'target');
  if (isError(target)) return { ok: false, error: target.error };
  const align = oneOf<HorizontalAlign>(args.align, HORIZONTAL_ALIGNS, 'align');
  if (isError(align)) return { ok: false, error: align.error };
  const verticalAlign = oneOf<VerticalAlign>(args.verticalAlign, VERTICAL_ALIGNS, 'verticalAlign');
  if (isError(verticalAlign)) return { ok: false, error: verticalAlign.error };
  const formatPreset = oneOf<FormatPreset>(args.formatPreset, FORMAT_PRESETS, 'formatPreset');
  if (isError(formatPreset)) return { ok: false, error: formatPreset.error };

  for (const flag of ['bold', 'italic'] as const) {
    if (args[flag] !== undefined && typeof args[flag] !== 'boolean') {
      return { ok: false, error: `${flag} must be a boolean.` };
    }
  }

  const colors = args.colors as { light?: ThemeColors; dark?: ThemeColors } | undefined;
  if (colors !== undefined && (typeof colors !== 'object' || colors === null || Array.isArray(colors))) {
    return { ok: false, error: 'colors must be an object shaped { "light": { "text"?, "background"? }, "dark": { ... } }.' };
  }

  const value: NormalizedColumnStyle = {
    colIds,
    allColumns,
    // Cells are the sensible default: most style asks are about values.
    target: target ?? 'cells',
    align,
    verticalAlign,
    colors,
    bold: args.bold as boolean | undefined,
    italic: args.italic as boolean | undefined,
    formatPreset,
    isEmpty:
      align === undefined &&
      verticalAlign === undefined &&
      colors === undefined &&
      args.bold === undefined &&
      args.italic === undefined &&
      formatPreset === undefined,
  };

  if (value.isEmpty) {
    return {
      ok: false,
      error: 'Nothing to apply — supply at least one of align, verticalAlign, colors, bold, italic or formatPreset.',
    };
  }
  // A header carries no value, so a number/date format on it is meaningless.
  if (formatPreset && value.target === 'headers') {
    return { ok: false, error: 'formatPreset applies to cell values; use target "cells" or "cells+headers".' };
  }
  return { ok: true, value };
}

export function wantsCells(target: StyleTarget): boolean {
  return target === 'cells' || target === 'cells+headers';
}

export function wantsHeaders(target: StyleTarget): boolean {
  return target === 'headers' || target === 'cells+headers';
}

/**
 * Merges one themed style slot. `colors` land only on the side(s) supplied;
 * alignment and typography go to both, since they don't vary by theme and a
 * one-sided write would vanish on theme flip.
 */
export function mergeThemedStyle(
  prev: ThemedCellStyleOverrides | undefined,
  style: NormalizedColumnStyle,
): ThemedCellStyleOverrides {
  const mergeSide = (side: 'light' | 'dark'): CellStyleOverrides => {
    const prevSide: CellStyleOverrides = prev?.[side] ?? {};
    const next: CellStyleOverrides = { ...prevSide };

    const colors = style.colors?.[side];
    if (colors) next.colors = { ...prevSide.colors, ...colors };

    if (style.bold !== undefined || style.italic !== undefined) {
      next.typography = {
        ...prevSide.typography,
        ...(style.bold !== undefined ? { bold: style.bold } : {}),
        ...(style.italic !== undefined ? { italic: style.italic } : {}),
      };
    }

    if (style.align !== undefined || style.verticalAlign !== undefined) {
      next.alignment = {
        ...prevSide.alignment,
        ...(style.align !== undefined ? { horizontal: style.align } : {}),
        ...(style.verticalAlign !== undefined ? { vertical: style.verticalAlign } : {}),
      };
    }

    return next;
  };

  return { light: mergeSide('light'), dark: mergeSide('dark') };
}

/** Human-readable summary of what a call changed, for the tool result. */
export function describeColumnStyle(style: NormalizedColumnStyle): string {
  const parts: string[] = [];
  if (style.align) parts.push(`${style.align}-aligned`);
  if (style.verticalAlign) parts.push(`${style.verticalAlign}-anchored`);
  if (style.bold !== undefined) parts.push(style.bold ? 'bold' : 'not bold');
  if (style.italic !== undefined) parts.push(style.italic ? 'italic' : 'not italic');
  if (style.colors) parts.push('recoloured');
  if (style.formatPreset) parts.push(`${style.formatPreset} format`);
  const what = parts.join(', ') || 'updated';
  const where =
    style.target === 'cells' ? 'cells' : style.target === 'headers' ? 'headers' : 'cells and headers';
  return `${what} (${where})`;
}
