// ─────────────────────────────────────────────────────────────
//  AG Grid Theme — Quartz (ag-grid v33+)
//  OKLCH CSS vars + light/dark theme modes (data-ag-theme-mode).
// ─────────────────────────────────────────────────────────────

import { iconSetQuartzLight, themeQuartz, type Theme } from 'ag-grid-community';

/** AG Grid Quartz compactness preset — maps to `theme.withParams` structural knobs. */
export type GridDensity = 'ultra' | 'compact' | 'comfort';

export const GRID_DENSITY_ORDER: readonly GridDensity[] = ['ultra', 'compact', 'comfort'];

export const GRID_DENSITY_LABELS: Record<GridDensity, string> = {
  ultra: 'Ultra',
  compact: 'Compact',
  comfort: 'Comfortable',
};

const AG_GRID_INTER_FONT = { googleFont: 'Inter' } as const;
const AG_GRID_MONO_FONT = { googleFont: 'JetBrains Mono' } as const;

/**
 * Structural theme params per density — aligned with AG Grid compactness guidance.
 * @see https://www.ag-grid.com/javascript-data-grid/theming-compactness/
 */
export function gridDensityStructuralParams(density: GridDensity) {
  const rowH = density === 'ultra' ? 22 : density === 'comfort' ? 40 : 30;
  const headerH = density === 'ultra' ? 26 : density === 'comfort' ? 42 : 32;
  const fontPx = density === 'ultra' ? 10 : density === 'comfort' ? 14 : 12;
  const headerFontPx = density === 'ultra' ? 10 : density === 'comfort' ? 13 : 11;
  const spacing = density === 'ultra' ? 4 : density === 'comfort' ? 8 : 6;
  const iconPx = density === 'ultra' ? 12 : density === 'comfort' ? 16 : 14;

  return {
    fontFamily: AG_GRID_INTER_FONT,
    fontSize: fontPx,
    headerFontFamily: AG_GRID_MONO_FONT,
    headerFontSize: headerFontPx,
    iconSize: iconPx,
    borderRadius: 2,
    wrapperBorderRadius: 2,
    cellHorizontalPaddingScale: 1,
    rowVerticalPaddingScale: 1,
    columnBorder: true as const,
    rowHeight: rowH,
    headerHeight: headerH,
    spacing,
    cellHorizontalPadding: 12,
  };
}

/** Infer the closest preset from persisted row/header heights (settings panel edits). */
export function inferGridDensity(rowHeight?: number, headerHeight?: number): GridDensity {
  for (const density of GRID_DENSITY_ORDER) {
    const p = gridDensityStructuralParams(density);
    if (p.rowHeight === rowHeight && p.headerHeight === headerHeight) return density;
  }
  return 'compact';
}

const densityThemeCache = new WeakMap<Theme, Map<GridDensity, Theme>>();

/** Apply a density preset on top of any Quartz theme (colors unchanged). */
export function applyGridDensityToTheme(theme: Theme, density: GridDensity): Theme {
  if (typeof theme?.withParams !== 'function') return theme;
  let byDensity = densityThemeCache.get(theme);
  if (!byDensity) {
    byDensity = new Map();
    densityThemeCache.set(theme, byDensity);
  }
  const cached = byDensity.get(density);
  if (cached) return cached;
  const next = theme.withParams(gridDensityStructuralParams(density));
  byDensity.set(density, next);
  return next;
}

export interface GridDensitySettingsSlice {
  gridDensity?: GridDensity;
  rowHeight?: number;
  headerHeight?: number;
}

/** Resolve active density from module state — explicit field wins, else height inference. */
export function resolveGridDensity(settings?: GridDensitySettingsSlice | null): GridDensity {
  if (settings?.gridDensity) return settings.gridDensity;
  return inferGridDensity(settings?.rowHeight, settings?.headerHeight);
}

/** Shared colour params — read live OKLCH tokens from the page. */
function staruiSharedColorParams() {
  return {
    backgroundColor: 'oklch(var(--card))',
    foregroundColor: 'oklch(var(--foreground))',
    borderColor: 'oklch(var(--grid-border))',
    oddRowBackgroundColor: 'oklch(var(--primary) / 0.022)',
    rowHoverColor: 'oklch(var(--primary) / 0.07)',
    selectedRowBackgroundColor: 'oklch(var(--primary) / 0.12)',
    rangeSelectionBackgroundColor: 'oklch(var(--primary) / 0.14)',
    rangeSelectionBorderColor: 'oklch(var(--primary) / 0.5)',
    accentColor: 'oklch(var(--primary))',
    checkboxCheckedBackgroundColor: 'oklch(var(--primary))',
    checkboxCheckedBorderColor: 'oklch(var(--primary))',
    checkboxUncheckedBackgroundColor: 'oklch(var(--card))',
    checkboxUncheckedBorderColor: 'oklch(var(--border))',
    toggleButtonOnBackgroundColor: 'oklch(var(--primary))',
    toggleButtonOffBackgroundColor: 'oklch(var(--muted))',
    menuBackgroundColor: 'oklch(var(--popover))',
    menuTextColor: 'oklch(var(--popover-foreground))',
    menuBorder: { style: 'solid' as const, width: 1, color: 'oklch(var(--border))' },
    tooltipBackgroundColor: 'oklch(var(--foreground))',
    tooltipTextColor: 'oklch(var(--background))',
    inputBackgroundColor: 'oklch(var(--card))',
    inputBorder: { style: 'solid' as const, width: 1, color: 'oklch(var(--border))' },
    inputFocusBorder: { style: 'solid' as const, width: 1, color: 'oklch(var(--primary))' },
    focusShadow: 'var(--ds-elevation-glow)',
    rowBorder: { style: 'solid' as const, width: 1, color: 'oklch(var(--grid-border))' },
    headerRowBorder: true,
    columnBorder: { style: 'solid' as const, width: 1, color: 'oklch(var(--grid-border) / 0.6)' },
    headerColumnBorder: { style: 'solid' as const, width: 1, color: 'oklch(var(--grid-border) / 0.7)' },
    headerColumnResizeHandleHeight: '0%',
    wrapperBorder: true,
    sidePanelBorder: true,
    headerFontWeight: 600,
    cellFontFamily: AG_GRID_MONO_FONT,
    cellTextColor: 'oklch(var(--foreground))',
    invalidColor: 'oklch(var(--destructive))',
  };
}

const STARUI_LIGHT_CHROME = {
  chromeBackgroundColor:
    'color-mix(in oklch, color-mix(in oklch, oklch(var(--card)) 97%, oklch(var(--primary))) 92%, #fff)',
  headerBackgroundColor: 'color-mix(in oklch, oklch(var(--muted)) 56%, #fff)',
  headerTextColor: 'oklch(var(--muted-foreground))',
};

const STARUI_DARK_CHROME = {
  chromeBackgroundColor: 'oklch(var(--popover))',
  headerBackgroundColor: 'oklch(var(--muted))',
  headerTextColor: 'oklch(var(--secondary-foreground))',
  columnBorder: { style: 'solid' as const, width: 1, color: 'oklch(0.34 0.016 258 / 0.55)' },
  headerColumnBorder: { style: 'solid' as const, width: 1, color: 'oklch(0.36 0.017 258 / 0.6)' },
  // Dark-mode selected-row tint (overrides the shared `--primary`-based value).
  selectedRowBackgroundColor: '#73BBF626',
};

function gridParams(mode: 'dark' | 'light', density: GridDensity = 'compact') {
  const chrome = mode === 'dark' ? STARUI_DARK_CHROME : STARUI_LIGHT_CHROME;
  return {
    browserColorScheme: mode,
    ...gridDensityStructuralParams(density),
    ...staruiSharedColorParams(),
    ...chrome,
  };
}

export const agGridDarkParams = gridParams('dark', 'compact');
export const agGridLightParams = gridParams('light', 'compact');
export const agGridComfortDarkParams = gridParams('dark', 'comfort');
export const agGridComfortLightParams = gridParams('light', 'comfort');
export const agGridBlotterDarkParams = gridParams('dark', 'ultra');
export const agGridBlotterLightParams = gridParams('light', 'ultra');

/** Canonical StarUI theme — light + dark modes; toggle via `data-ag-theme-mode` on `<html>`. */
function bakeStaruiTheme(density: GridDensity = 'compact'): Theme {
  const structural = gridDensityStructuralParams(density);
  const shared = staruiSharedColorParams();
  return themeQuartz.withPart(iconSetQuartzLight)
    .withParams({
      browserColorScheme: 'light',
      ...structural,
      ...shared,
      ...STARUI_LIGHT_CHROME,
    }, 'light')
    .withParams({
      browserColorScheme: 'dark',
      // Mode-specific params don't inherit across modes (AG Grid Theming
      // API), so the structural + shared colour params MUST be repeated in
      // the dark block — otherwise the cell body falls back to Quartz's
      // default grey instead of the design-system `oklch(var(--card))`.
      ...structural,
      ...shared,
      ...STARUI_DARK_CHROME,
    }, 'dark');
}

export const staruiGridTheme = bakeStaruiTheme('compact');

/** @deprecated Use `staruiGridTheme` + `data-ag-theme-mode` on `<html>` (set by `applyTheme`). */
export const agGridLightTheme = staruiGridTheme;

/** @deprecated Use `staruiGridTheme` + `data-ag-theme-mode` on `<html>` (set by `applyTheme`). */
export const agGridDarkTheme = staruiGridTheme;

export const agGridComfortDarkTheme = applyGridDensityToTheme(staruiGridTheme, 'comfort');
export const agGridComfortLightTheme = applyGridDensityToTheme(staruiGridTheme, 'comfort');
export const agGridBlotterDarkTheme = applyGridDensityToTheme(staruiGridTheme, 'ultra');
export const agGridBlotterLightTheme = applyGridDensityToTheme(staruiGridTheme, 'ultra');
