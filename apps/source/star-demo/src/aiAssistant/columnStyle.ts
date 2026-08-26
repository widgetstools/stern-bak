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
import { normalizeRenderer } from './cellRenderers';

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

export const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export const BORDER_STYLES = ['solid', 'dashed', 'dotted'] as const;
export type BorderSide = (typeof BORDER_SIDES)[number];
export type BorderStyle = (typeof BORDER_STYLES)[number];

export interface BorderSpec {
  width: number;
  color: string;
  style: BorderStyle;
}

/**
 * Any of the four formatter kinds the toolbar can author. `preset` covers the
 * common cases; `excelFormat` and `tick` are what the formatting toolbar's
 * advanced modes write, and were previously unreachable from the assistant.
 */
export type ValueFormatter =
  | { kind: 'preset'; preset: FormatPreset; options?: Record<string, unknown> }
  | { kind: 'excelFormat'; format: string }
  | { kind: 'tick'; tick: TickToken };

export const TICK_TOKENS = ['TICK32', 'TICK32_PLUS', 'TICK64', 'TICK128', 'TICK256'] as const;
export type TickToken = (typeof TICK_TOKENS)[number];

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
  underline?: boolean;
  fontSize?: number;
  borders?: Partial<Record<BorderSide, BorderSpec>>;
  clearBorders?: boolean;
  formatPreset?: FormatPreset;
  /** Full formatter union — supersedes `formatPreset` when both are given. */
  formatter?: ValueFormatter;
  headerName?: string;
  editable?: boolean;
  renderer?: { cellRendererId: string; cellRendererConfig: { kind: string; config: Record<string, unknown> } };
  clearRenderer?: boolean;
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

  for (const flag of ['bold', 'italic', 'underline', 'editable', 'clearBorders', 'clearRenderer'] as const) {
    if (args[flag] !== undefined && typeof args[flag] !== 'boolean') {
      return { ok: false, error: `${flag} must be a boolean.` };
    }
  }

  if (args.fontSize !== undefined) {
    const px = args.fontSize;
    if (typeof px !== 'number' || !Number.isFinite(px) || px <= 0) {
      return { ok: false, error: 'fontSize must be a positive number of pixels.' };
    }
  }

  if (args.headerName !== undefined && typeof args.headerName !== 'string') {
    return { ok: false, error: 'headerName must be a string.' };
  }

  const borders = normalizeBorders(args.borders);
  if (isError(borders)) return { ok: false, error: borders.error };

  const formatter = normalizeFormatter(args.formatter);
  if (isError(formatter)) return { ok: false, error: formatter.error };

  let renderer: NormalizedColumnStyle['renderer'];
  if (args.renderer !== undefined) {
    const parsed = normalizeRenderer(args.renderer);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    renderer = parsed.value;
  }

  const colors = args.colors as { light?: ThemeColors; dark?: ThemeColors } | undefined;
  if (colors !== undefined && (typeof colors !== 'object' || colors === null || Array.isArray(colors))) {
    return { ok: false, error: 'colors must be an object shaped { "light": { "text"?, "background"? }, "dark": { ... } }.' };
  }

  const touched = [
    align, verticalAlign, colors, formatPreset, formatter, renderer, borders,
    args.bold, args.italic, args.underline, args.fontSize, args.headerName,
    args.editable, args.clearBorders, args.clearRenderer,
  ].some((v) => v !== undefined);

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
    underline: args.underline as boolean | undefined,
    fontSize: args.fontSize as number | undefined,
    borders,
    clearBorders: args.clearBorders as boolean | undefined,
    formatPreset,
    formatter,
    headerName: args.headerName as string | undefined,
    editable: args.editable as boolean | undefined,
    renderer,
    clearRenderer: args.clearRenderer as boolean | undefined,
    isEmpty: !touched,
  };

  if (value.isEmpty) {
    return {
      ok: false,
      error:
        'Nothing to apply — supply at least one of align, verticalAlign, colors, bold, italic, underline, ' +
        'fontSize, borders, headerName, editable, formatPreset, formatter or renderer.',
    };
  }
  // A header carries no value, so a number format or a renderer on it is
  // meaningless — better to say so than to write something inert.
  if (value.target === 'headers') {
    const cellOnly = [
      formatPreset !== undefined && 'formatPreset',
      formatter !== undefined && 'formatter',
      renderer !== undefined && 'renderer',
      args.editable !== undefined && 'editable',
    ].filter(Boolean) as string[];
    if (cellOnly.length > 0) {
      return {
        ok: false,
        error: `${cellOnly.join(', ')} appl${cellOnly.length > 1 ? 'y' : 'ies'} to cell values; use target "cells" or "cells+headers".`,
      };
    }
  }
  // `headerName` renames the column itself, so it isn't a cells-vs-headers
  // choice — accepted with any target and applied once.
  return { ok: true, value };
}

function normalizeBorders(raw: unknown): Partial<Record<BorderSide, BorderSpec>> | undefined | { error: string } {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'borders must be an object keyed by side, e.g. { "bottom": { "width": 1, "color": "#3a4552", "style": "solid" } }.' };
  }
  const out: Partial<Record<BorderSide, BorderSpec>> = {};
  for (const [side, spec] of Object.entries(raw as Record<string, unknown>)) {
    if (!(BORDER_SIDES as readonly string[]).includes(side)) {
      return { error: `borders."${side}" is not a side. Use: ${BORDER_SIDES.join(', ')}.` };
    }
    if (typeof spec !== 'object' || spec === null) {
      return { error: `borders.${side} must be { width, color, style }.` };
    }
    const { width, color, style } = spec as { width?: unknown; color?: unknown; style?: unknown };
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      return { error: `borders.${side}.width must be a positive number of pixels.` };
    }
    if (typeof color !== 'string' || !color) {
      return { error: `borders.${side}.color must be a CSS colour string.` };
    }
    if (style !== undefined && !(BORDER_STYLES as readonly string[]).includes(style as string)) {
      return { error: `borders.${side}.style must be one of: ${BORDER_STYLES.join(', ')}.` };
    }
    out[side as BorderSide] = { width, color, style: (style as BorderStyle) ?? 'solid' };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeFormatter(raw: unknown): ValueFormatter | undefined | { error: string } {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'formatter must be an object with a "kind" of preset, excelFormat or tick.' };
  }
  const { kind } = raw as { kind?: unknown };
  if (kind === 'preset') {
    const { preset, options } = raw as { preset?: unknown; options?: unknown };
    if (typeof preset !== 'string' || !(FORMAT_PRESETS as readonly string[]).includes(preset)) {
      return { error: `formatter.preset must be one of: ${FORMAT_PRESETS.join(', ')}.` };
    }
    if (options !== undefined && (typeof options !== 'object' || options === null)) {
      return { error: 'formatter.options must be an object of Intl options.' };
    }
    return { kind: 'preset', preset: preset as FormatPreset, options: options as Record<string, unknown> | undefined };
  }
  if (kind === 'excelFormat') {
    const { format } = raw as { format?: unknown };
    if (typeof format !== 'string' || !format) {
      return { error: 'formatter.format must be an Excel format string, e.g. \'[Green]"▲ "#,##0.00;[Red]"▼ "#,##0.00\'.' };
    }
    return { kind: 'excelFormat', format };
  }
  if (kind === 'tick') {
    const { tick } = raw as { tick?: unknown };
    if (typeof tick !== 'string' || !(TICK_TOKENS as readonly string[]).includes(tick)) {
      return { error: `formatter.tick must be one of: ${TICK_TOKENS.join(', ')}.` };
    }
    return { kind: 'tick', tick: tick as TickToken };
  }
  return { error: 'formatter.kind must be "preset", "excelFormat" or "tick".' };
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

    if (
      style.bold !== undefined ||
      style.italic !== undefined ||
      style.underline !== undefined ||
      style.fontSize !== undefined
    ) {
      next.typography = {
        ...prevSide.typography,
        ...(style.bold !== undefined ? { bold: style.bold } : {}),
        ...(style.italic !== undefined ? { italic: style.italic } : {}),
        ...(style.underline !== undefined ? { underline: style.underline } : {}),
        ...(style.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
      };
    }

    if (style.clearBorders) {
      delete next.borders;
    } else if (style.borders) {
      // Per-side merge: setting a bottom border must not drop an existing top.
      next.borders = { ...prevSide.borders, ...style.borders };
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
  if (style.underline !== undefined) parts.push(style.underline ? 'underlined' : 'not underlined');
  if (style.fontSize !== undefined) parts.push(`${style.fontSize}px text`);
  if (style.colors) parts.push('recoloured');
  if (style.borders) parts.push(`bordered (${Object.keys(style.borders).join(', ')})`);
  if (style.clearBorders) parts.push('borders cleared');
  if (style.headerName !== undefined) parts.push(`renamed to "${style.headerName}"`);
  if (style.editable !== undefined) parts.push(style.editable ? 'editable' : 'read-only');
  if (style.renderer) parts.push(`"${style.renderer.cellRendererId}" renderer`);
  if (style.clearRenderer) parts.push('renderer cleared');
  if (style.formatter) {
    parts.push(
      style.formatter.kind === 'preset'
        ? `${style.formatter.preset} format`
        : style.formatter.kind === 'tick'
          ? `${style.formatter.tick} tick format`
          : 'Excel format',
    );
  } else if (style.formatPreset) parts.push(`${style.formatPreset} format`);
  const what = parts.join(', ') || 'updated';
  const where =
    style.target === 'cells' ? 'cells' : style.target === 'headers' ? 'headers' : 'cells and headers';
  return `${what} (${where})`;
}
