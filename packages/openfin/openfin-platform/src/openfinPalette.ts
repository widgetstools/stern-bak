/**
 * Build OpenFin Workspace `CustomPaletteSet` values from StarUI design-system
 * CSS tokens (`starui-tokens.css`). OpenFin requires concrete hex/rgb/hsl colors —
 * not CSS variables or bare OKLCH components — so we resolve tokens at runtime via
 * the browser's color parser.
 */

/** Mirrors `@openfin/workspace-platform` `CustomPaletteSet` (required + common optional keys). */
export interface OpenFinPaletteSet {
  brandPrimary: string;
  brandSecondary: string;
  backgroundPrimary: string;
  brandPrimaryActive?: string;
  brandPrimaryHover?: string;
  brandPrimaryFocused?: string;
  brandPrimaryText?: string;
  brandSecondaryActive?: string;
  brandSecondaryHover?: string;
  brandSecondaryFocused?: string;
  brandSecondaryText?: string;
  background1?: string;
  background2?: string;
  background3?: string;
  background4?: string;
  background5?: string;
  background6?: string;
  contentBackground1?: string;
  contentBackground2?: string;
  contentBackground3?: string;
  contentBackground4?: string;
  contentBackground5?: string;
  borderNeutral?: string;
  inputBackground?: string;
  inputColor?: string;
  inputPlaceholder?: string;
  inputDisabled?: string;
  inputFocused?: string;
  inputBorder?: string;
  textDefault?: string;
  textHelp?: string;
  textInactive?: string;
  statusSuccess?: string;
  statusWarning?: string;
  statusCritical?: string;
  statusActive?: string;
}

export interface OpenFinThemeOverrides {
  brandPrimary?: string;
  brandSecondary?: string;
  backgroundPrimary?: string;
}

/** OpenFin reference palettes — used when DOM/CSS is unavailable (e.g. unit tests without tokens). */
export const FALLBACK_OPENFIN_DARK_PALETTE: OpenFinPaletteSet = {
  brandPrimary: '#0A76D3',
  brandSecondary: '#383A40',
  backgroundPrimary: '#1E1F23',
  background1: '#111214',
  background2: '#1E1F23',
  background3: '#24262B',
  background4: '#2F3136',
  background5: '#383A40',
  background6: '#53565F',
  brandSecondaryActive: '#33353B',
  brandSecondaryHover: '#44464E',
  brandSecondaryFocused: '#FFFFFF',
  brandSecondaryText: '#FFFFFF',
  inputBackground: '#53565F',
  inputColor: '#FFFFFF',
  inputPlaceholder: '#C9CBD2',
  inputDisabled: '#7D808A',
  inputFocused: '#C9CBD2',
  inputBorder: '#7D808A',
  textDefault: '#FFFFFF',
  textHelp: '#C9CBD2',
  textInactive: '#7D808A',
  contentBackground1: '#111214',
  contentBackground2: '#1E1F23',
  contentBackground3: '#24262B',
  contentBackground4: '#2F3136',
  contentBackground5: '#383A40',
  statusSuccess: '#207735',
  statusWarning: '#F48F00',
  statusCritical: '#F31818',
  statusActive: '#0A76D3',
  borderNeutral: '#C0C1C2',
};

export const FALLBACK_OPENFIN_LIGHT_PALETTE: OpenFinPaletteSet = {
  brandPrimary: '#0A76D3',
  brandSecondary: '#DDDFE4',
  backgroundPrimary: '#FAFBFE',
  background1: '#FFFFFF',
  background2: '#FAFBFE',
  background3: '#F3F5F8',
  background4: '#ECEEF1',
  background5: '#DDDFE4',
  background6: '#C9CBD2',
  brandSecondaryActive: '#D7DADF',
  brandSecondaryHover: '#EBECEF',
  brandSecondaryFocused: '#1E1F23',
  brandSecondaryText: '#1E1F23',
  inputBackground: '#ECEEF1',
  inputColor: '#1E1F23',
  inputPlaceholder: '#383A40',
  inputDisabled: '#7D808A',
  inputFocused: '#C9CBD2',
  inputBorder: '#7D808A',
  textDefault: '#1E1F23',
  textHelp: '#2F3136',
  textInactive: '#7D808A',
  contentBackground1: '#FFFFFF',
  contentBackground2: '#FAFBFE',
  contentBackground3: '#F3F5F8',
  contentBackground4: '#ECEEF1',
  contentBackground5: '#DDDFE4',
  statusSuccess: '#207735',
  statusWarning: '#F48F00',
  statusCritical: '#F31818',
  statusActive: '#0A76D3',
  borderNeutral: '#C0C1C2',
};

/** Convert `rgb()` / `rgba()` from `getComputedStyle().color` to `#rrggbb`. */
export function rgbStringToHex(rgb: string): string {
  if (rgb.startsWith('#')) return rgb.toUpperCase();
  const match = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return rgb;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = hex.replace(/^#/, '');
  const expanded = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

/**
 * Mix two hex colors in sRGB space (`pctA` = percentage of `hexA`).
 *
 * A non-finite `pctA` used to propagate straight through the bit-packing
 * below and emit the literal string `'#AN'` (`NaN.toString(16)` is `'NaN'`,
 * sliced to `'aN'`), which OpenFin accepts into a palette and then renders
 * as an undefined color. Clamp instead so a bad input degrades to one of
 * the two endpoints rather than to garbage.
 */
function mixHex(hexA: string, hexB: string, pctA: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = Number.isFinite(pctA) ? Math.max(0, Math.min(100, pctA)) / 100 : 1;
  const r = Math.round(a.r * t + b.r * (1 - t));
  const g = Math.round(a.g * t + b.g * (1 - t));
  const bl = Math.round(a.b * t + b.b * (1 - t));
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1).toUpperCase()}`;
}

const ON_PRIMARY_WHITE = '#FFFFFF';

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const norm = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * norm(r) + 0.7152 * norm(g) + 0.0722 * norm(b);
}

function contrastRatio(fg: string, bg: string): number {
  const lf = relativeLuminance(fg);
  const lb = relativeLuminance(bg);
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG contrast between two palette hex colors (for tests). */
export function paletteContrastRatio(fg: string, bg: string): number {
  return contrastRatio(fg, bg);
}

/** Pick legible label color on `brandPrimary` (WCAG AA body text ≥ 4.5). */
function pickOnPrimaryText(candidate: string, brandPrimary: string): string {
  const normalized = candidate.toUpperCase();
  if (contrastRatio(normalized, brandPrimary) >= 4.5) return normalized;
  return contrastRatio(ON_PRIMARY_WHITE, brandPrimary) >= 4.5 ? ON_PRIMARY_WHITE : '#F7FAFF';
}

/**
 * OpenFin browser page tabs paint the active tab with `brandPrimary`. In light
 * mode the platform often labels tabs with `textDefault` (dark). Lighten the
 * tab fill toward the page background so dark labels stay legible.
 */
function finalizeLightChromePalette(palette: OpenFinPaletteSet): OpenFinPaletteSet {
  const pageBg = palette.background1 ?? ON_PRIMARY_WHITE;
  const tabFill = mixHex(palette.brandPrimary, pageBg, 38);
  const tabFillHover = mixHex(palette.brandPrimaryHover ?? palette.brandPrimary, pageBg, 34);
  const tabFillActive = mixHex(palette.brandPrimaryActive ?? palette.brandPrimary, pageBg, 30);
  const tabLabel = palette.textDefault ?? '#1E1F23';
  const onTab = pickOnPrimaryText(tabLabel, tabFill);
  return {
    ...palette,
    brandPrimary: tabFill,
    brandPrimaryHover: tabFillHover,
    brandPrimaryActive: tabFillActive,
    brandPrimaryText: onTab,
    brandPrimaryFocused: onTab,
    statusActive: tabFill,
  };
}

/**
 * Light grey used for the dark-scheme chrome outline. The dark
 * `--border-strong` token resolves to a mid-grey that's too close to the
 * dark surfaces, so a dark OpenFin window blends into a dark desktop. A
 * light-grey divider (matching OpenFin's own dark `borderNeutral` default)
 * makes the window frame distinguishable from the background. Scoped to the
 * dark chrome palette only — the design-system token is untouched, and the
 * light palette keeps its darker border.
 */
const DARK_CHROME_BORDER_NEUTRAL = '#C0C1C2';

/**
 * How far to lift the dark-scheme window header (title bar + tab strip) toward
 * the foreground, as a percent. Our dark `--card` token (which feeds
 * `backgroundPrimary`) sits only a hair above the page `--background`, so the
 * OpenFin window header reads as near-black and melts into a dark desktop.
 * OpenFin's own reference dark palette deliberately makes `backgroundPrimary`
 * (`#1E1F23`) clearly lighter than the page (`#111214`); a ~10% lift restores
 * that separation, landing around the grid's header-row grey. Scoped to the
 * dark chrome palette only — the design-system `--card` token is untouched.
 */
const DARK_CHROME_HEADER_LIGHTEN_PCT = 10;

function finalizeDarkChromePalette(palette: OpenFinPaletteSet): OpenFinPaletteSet {
  const onPrimary = pickOnPrimaryText(palette.brandPrimaryText ?? ON_PRIMARY_WHITE, palette.brandPrimary);
  const headerBg = mixHex(
    palette.textDefault ?? ON_PRIMARY_WHITE,
    palette.backgroundPrimary,
    DARK_CHROME_HEADER_LIGHTEN_PCT,
  );
  return {
    ...palette,
    // Lift the chrome header surfaces (title bar + tab strip) only; the
    // content ramp (`contentBackground*`) and page `background1` stay dark.
    backgroundPrimary: headerBg,
    background2: headerBg,
    brandPrimaryText: onPrimary,
    brandPrimaryFocused: onPrimary,
    borderNeutral: DARK_CHROME_BORDER_NEUTRAL,
  };
}

/**
 * Convert bare OKLCH components (`"L C H"`, L in 0–1) to `#rrggbb`.
 * Used when jsdom / older parsers leave `oklch(...)` unresolved.
 */
export function oklchComponentsToHex(components: string): string {
  const parts = components.trim().split(/\s+/);
  if (parts.length < 3) return '#000000';
  const L = Number(parts[0]);
  const C = Number(parts[1]);
  const H = Number(parts[2]);
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574015 * m - 0.3413193965 * s;
  let bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const toSrgb = (c: number) => {
    const abs = Math.abs(c);
    if (abs <= 0.0031308) return 12.92 * c;
    return Math.sign(c) * (1.055 * abs ** (1 / 2.4) - 0.055);
  };
  r = toSrgb(r);
  g = toSrgb(g);
  bLin = toSrgb(bLin);

  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(bLin))
    .toString(16)
    .slice(1)
    .toUpperCase()}`;
}

function parseOklchString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('oklch(')) return null;
  const inner = trimmed.slice(6, -1).trim();
  const components = inner.split('/')[0]?.trim() ?? '';
  return oklchComponentsToHex(components);
}

function readResolvedColor(scope: HTMLElement, cssColor: string): string {
  const probe = document.createElement('span');
  probe.style.color = cssColor;
  scope.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  scope.removeChild(probe);
  if (/^rgba?\(/i.test(resolved)) return rgbStringToHex(resolved);
  const fromOklch = parseOklchString(resolved);
  if (fromOklch) return fromOklch;
  return rgbStringToHex(resolved);
}

/** Read a bare OKLCH component token (`--primary: L C H`) as hex. */
function readOklchTokenHex(scope: HTMLElement, varName: string): string {
  const raw = getComputedStyle(scope).getPropertyValue(varName).trim();
  if (!raw) return '#000000';
  if (/^rgba?\(/i.test(raw) || raw.startsWith('#')) return rgbStringToHex(raw);
  if (raw.startsWith('oklch(')) {
    const parsed = parseOklchString(raw);
    if (parsed) return parsed;
  }
  const color = `oklch(${raw})`;
  const resolved = readResolvedColor(scope, color);
  if (resolved.startsWith('oklch(') || !resolved.startsWith('#')) {
    return oklchComponentsToHex(raw);
  }
  return resolved;
}

function readColorExpression(scope: HTMLElement, expression: string): string {
  const mixMatch = expression.match(
    /color-mix\(in oklch, oklch\(var\(--([^)]+)\)\) (\d+)%,\s*oklch\(var\(--([^)]+)\)\) (\d+)%\)/,
  );
  if (mixMatch) {
    // Groups: 1 = first var name, 2 = first pct, 3 = second var name, 4 = second pct.
    const hexA = readOklchTokenHex(scope, `--${mixMatch[1]}`);
    const hexB = readOklchTokenHex(scope, `--${mixMatch[3]}`);
    return mixHex(hexA, hexB, Number(mixMatch[2]));
  }

  const alphaMatch = expression.match(/oklch\(var\(--([^)]+)\)\s*\/\s*([\d.]+)\)/);
  if (alphaMatch) {
    const base = readOklchTokenHex(scope, `--${alphaMatch[1]}`);
    const bg = readOklchTokenHex(scope, '--background');
    return mixHex(base, bg, Number(alphaMatch[2]) * 100);
  }

  return readResolvedColor(scope, expression);
}

/**
 * Build one OpenFin palette from a scoped element carrying `[data-theme]`
 * so `starui-tokens.css` dark/light blocks apply.
 */
export function buildPaletteFromThemeScope(scope: HTMLElement): OpenFinPaletteSet {
  const primary = readOklchTokenHex(scope, '--primary');
  const primaryFg = readOklchTokenHex(scope, '--primary-foreground');
  const foreground = readOklchTokenHex(scope, '--foreground');
  const background = readOklchTokenHex(scope, '--background');
  const card = readOklchTokenHex(scope, '--card');
  const secondary = readOklchTokenHex(scope, '--secondary');
  const secondaryFg = readOklchTokenHex(scope, '--secondary-foreground');
  const muted = readOklchTokenHex(scope, '--muted');
  const accent = readOklchTokenHex(scope, '--accent');
  const border = readOklchTokenHex(scope, '--border');
  const borderStrong = readOklchTokenHex(scope, '--border-strong');
  const mutedFg = readOklchTokenHex(scope, '--muted-foreground');
  const positive = readOklchTokenHex(scope, '--positive');
  const negative = readOklchTokenHex(scope, '--negative');
  const warning = readOklchTokenHex(scope, '--warning');

  const primaryHover = readColorExpression(
    scope,
    'color-mix(in oklch, oklch(var(--primary)) 88%, oklch(var(--foreground)) 12%)',
  );
  const primaryActive = readColorExpression(
    scope,
    'color-mix(in oklch, oklch(var(--primary)) 82%, oklch(var(--foreground)) 18%)',
  );
  const secondaryHover = readColorExpression(
    scope,
    'color-mix(in oklch, oklch(var(--secondary)) 92%, oklch(var(--foreground)) 8%)',
  );
  const secondaryActive = readColorExpression(
    scope,
    'color-mix(in oklch, oklch(var(--secondary)) 88%, oklch(var(--foreground)) 12%)',
  );
  const textInactive = readColorExpression(
    scope,
    'oklch(var(--muted-foreground) / 0.75)',
  );
  const inputDisabled = readColorExpression(
    scope,
    'oklch(var(--muted-foreground) / 0.55)',
  );

  return {
    brandPrimary: primary,
    brandPrimaryHover: primaryHover,
    brandPrimaryActive: primaryActive,
    brandPrimaryFocused: primaryFg,
    brandPrimaryText: primaryFg,
    brandSecondary: secondary,
    brandSecondaryHover: secondaryHover,
    brandSecondaryActive: secondaryActive,
    brandSecondaryFocused: foreground,
    brandSecondaryText: secondaryFg,
    backgroundPrimary: card,
    background1: background,
    background2: card,
    background3: secondary,
    background4: muted,
    background5: accent,
    background6: borderStrong,
    contentBackground1: background,
    contentBackground2: card,
    contentBackground3: secondary,
    contentBackground4: muted,
    contentBackground5: accent,
    // Chrome dividers/outlines read off the stronger border token so the
    // workspace frame separates from surfaces more distinctly than the
    // hairline `--border` used for input fields (`inputBorder` below).
    borderNeutral: borderStrong,
    inputBackground: muted,
    inputColor: foreground,
    inputPlaceholder: mutedFg,
    inputDisabled,
    inputFocused: mutedFg,
    inputBorder: border,
    textDefault: foreground,
    textHelp: mutedFg,
    textInactive,
    statusSuccess: positive,
    statusWarning: warning,
    statusCritical: negative,
    statusActive: primary,
  };
}

/**
 * Resolve dark + light OpenFin palettes from loaded `@wellsfargo-starui/design-system/css`.
 * Falls back to reference palettes when `document` is missing or resolution fails.
 *
 * Light tokens live on `:root` / `[data-theme="light"]`; dark on `[data-theme="dark"]`.
 * We flip `<html data-theme>` while reading so each palette is sampled under the
 * correct scheme (a child probe cannot override inherited dark vars on its own).
 */
export function buildOpenFinPalettesFromDesignSystem(): {
  dark: OpenFinPaletteSet;
  light: OpenFinPaletteSet;
} {
  if (typeof document === 'undefined' || !document.body) {
    return {
      dark: finalizeDarkChromePalette({ ...FALLBACK_OPENFIN_DARK_PALETTE }),
      light: finalizeLightChromePalette({ ...FALLBACK_OPENFIN_LIGHT_PALETTE }),
    };
  }

  const html = document.documentElement;
  const previousTheme = html.getAttribute('data-theme');
  const previousAgMode = html.getAttribute('data-ag-theme-mode');
  const probe = document.createElement('div');
  probe.setAttribute('data-starui-palette-probe', 'true');
  probe.style.cssText =
    'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden';
  document.body.appendChild(probe);

  try {
    html.setAttribute('data-theme', 'dark');
    html.setAttribute('data-ag-theme-mode', 'dark');
    const dark = buildPaletteFromThemeScope(probe);

    html.setAttribute('data-theme', 'light');
    html.setAttribute('data-ag-theme-mode', 'light');
    const light = buildPaletteFromThemeScope(probe);

    if (!dark.brandPrimary || dark.brandPrimary === '#000000') {
      throw new Error('dark palette resolution produced empty primary');
    }
    if (!light.brandPrimary || light.brandPrimary === '#000000') {
      throw new Error('light palette resolution produced empty primary');
    }
    if (dark.background1 === light.background1) {
      throw new Error('light and dark palettes resolved to identical backgrounds');
    }

    return {
      dark: finalizeDarkChromePalette(dark),
      light: finalizeLightChromePalette(light),
    };
  } catch (err) {
    console.warn(
      '[openfin-platform] Failed to resolve palettes from design-system CSS; using fallbacks.',
      err,
    );
    return {
      dark: finalizeDarkChromePalette({ ...FALLBACK_OPENFIN_DARK_PALETTE }),
      light: finalizeLightChromePalette({ ...FALLBACK_OPENFIN_LIGHT_PALETTE }),
    };
  } finally {
    if (previousTheme) {
      html.setAttribute('data-theme', previousTheme);
    } else {
      html.removeAttribute('data-theme');
    }
    if (previousAgMode) {
      html.setAttribute('data-ag-theme-mode', previousAgMode);
    } else {
      html.removeAttribute('data-ag-theme-mode');
    }
    probe.remove();
  }
}

/** Apply optional `initWorkspace({ theme })` overrides onto a dark-scheme palette. */
export function applyDarkPaletteOverrides(
  palette: OpenFinPaletteSet,
  overrides?: OpenFinThemeOverrides,
): OpenFinPaletteSet {
  if (!overrides) return palette;
  return {
    ...palette,
    brandPrimary: overrides.brandPrimary ?? palette.brandPrimary,
    brandSecondary: overrides.brandSecondary ?? palette.brandSecondary,
    backgroundPrimary: overrides.backgroundPrimary ?? palette.backgroundPrimary,
  };
}
