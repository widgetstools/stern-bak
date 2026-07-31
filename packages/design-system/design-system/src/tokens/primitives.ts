// ─────────────────────────────────────────────────────────────
//  STARUI — Primitive Tokens
//  Raw palette, type scale, spacing, radius, opacity, timing.
//
//  Binance-inspired trading palette:
//    - Graphite chrome with a cyan signature accent.
//    - Trading semantics are palette-locked (mint-teal buy / rose sell).
// ─────────────────────────────────────────────────────────────

export const colors = {
  // ── Cool paper (light chrome) — clinical light surface scale
  paper: {
    50:  '#ffffff',  // card / elevated surface
    75:  '#f8fafc',  // AG Grid odd-row only
    100: '#f1f3f6',  // ground
    200: '#e9ecf0',  // tertiary
    300: '#dde1e7',  // quaternary
    400: '#c8cdd5',  // muted chrome
    500: '#d4d8de',  // border primary
    600: '#b6bbc4',  // border secondary
    700: '#8e94a0',  // border tertiary
  },
  // ── Pewter ink (light text)
  ink: {
    0:   '#18222f',
    1:   '#2f3a4a',
    2:   '#525d6c',
    3:   '#7a8392',
    4:   '#abb1bb',
  },
  // ── Pewter graphite (dark chrome)
  graphite: {
    975: '#171a1d',
    960: '#1e2125',
    950: '#212429',
    900: '#2c2f34',
    850: '#383c42',
    800: '#4b4f57',
    700: '#3e4148',
    600: '#2c2f34',
    500: '#686d73',
    400: '#8f939a',
    300: '#c1c4c9',
    50:  '#ebedef',
    450: '#494c52',  // disabled text
    650: '#565a61',  // border tertiary
  },
  // ── Teal / positive (STARUI --st-buy) ──
  teal: {
    light:    '#0d9488',
    lightHov: '#0b7a70',
    dark:     '#22e3a8',
    darkHov:  '#3fecb8',
  },
  // ── Red / negative (STARUI --st-sell) ──
  rose: {
    light:    '#e11d48',
    lightHov: '#be123c',
    dark:     '#ff5a82',
    darkHov:  '#ff7898',
  },
  // ── Warning (palette-locked) ──
  amber: {
    light:    '#b27607',
    dark:     '#f5c14b',
  },
  // ── Brand / signature cyan (STARUI --st-accent) ──
  brand: {
    light:    '#0891b2',
    lightHov: '#0e7490',
    lightLo:  '#0e7490',
    dark:     '#22d3ee',
    darkHov:  '#4ae0f2',
    darkHi:   '#4ae0f2',
  },
  // ── Info (STARUI signature cyan — same hue family as brand) ──
  cyan: {
    light:          '#0891b2',
    lightHov:       '#0e7490',
    dark:           '#22d3ee',
    darkHov:        '#4ae0f2',
    highlightLight: '#0891b2',
    highlightDark:  '#22d3ee',
  },
  // ── Purple / chart accent ──
  purple: {
    light:    '#7631c4',
    dark:     '#af7de8',
  },
  // ── CVD-safe alternates ──
  cvd: {
    buyLight:  '#1e4fb8',
    sellLight: '#c2410c',
    buyDark:   '#7aa6ff',
    sellDark:  '#ff9d4e',
  },
} as const;

export const typography = {
  fontFamily: {
    sans:  "'Inter', system-ui, -apple-system, 'Segoe UI', 'Geist', sans-serif",
    mono:  "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, 'SF Mono', monospace",
    serif: "'Geist', Georgia, serif",
    sansDark: "'Inter', system-ui, -apple-system, 'Segoe UI', 'Geist', sans-serif",
    monoDark: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, 'SF Mono', monospace",
  },
  fontSize: {
    '2xs': '10px',
    xs:    '11px',
    sm:    '12px',
    md:    '13px',
    lg:    '14px',
    xl:    '16px',
    '2xl': '20px',
    '3xl': '28px',
    '4xl': '40px',
    '5xl': '56px',
  },
  fontWeight: {
    regular:  400,
    book:     450,
    medium:   500,
    semibold: 600,
    bold:     700,
  },
  letterSpacing: {
    tight:   '-0.02em',
    snug:    '-0.005em',
    normal:  '0',
    wide:    '0.02em',
    wider:   '0.04em',
    widest:  '0.06em',
  },
  lineHeight: {
    none:    1,
    tight:   1.2,
    snug:    1.35,
    normal:  1.5,
    relaxed: 1.65,
  },
  fontVariantNumeric: {
    tabular: 'tabular-nums',
    lining:  'lining-nums',
  },
} as const;

export const spacing = {
  0:   0,
  px:  1,
  0.5: 2,
  1:   4,
  1.5: 6,
  2:   8,
  2.5: 10,
  3:   12,
  4:   16,
  5:   20,
  6:   24,
  8:   32,
  10:  40,
} as const;

export const radius = {
  none: '0px',
  sm:   '2px',
  md:   '2px',
  lg:   '2px',
  xl:   '2px',
  full: '9999px',
} as const;

export const opacity = {
  muted:  0.06,
  subtle: 0.08,
  light:  0.12,
  medium: 0.25,
  heavy:  0.35,
  solid:  1.0,
} as const;

export const transition = {
  instant:   '80ms cubic-bezier(0.4,0,0.6,1)',
  fast:      '140ms cubic-bezier(0.4,0,0.2,1)',
  normal:    '220ms cubic-bezier(0.4,0,0.2,1)',
  slow:      '420ms cubic-bezier(0.4,0,0.2,1)',
  emphasis:  '640ms cubic-bezier(0.2,0.8,0.2,1)',
  tickFlash: '900ms cubic-bezier(0.25,0.1,0.25,1)',
} as const;

export const shadow = {
  none: 'none',
  sm:   '0 1px 2px rgba(12,29,48,0.06)',
  md:   '0 2px 8px rgba(12,29,48,0.08), 0 1px 0 rgba(255,255,255,0.6) inset',
  lg:   '0 12px 32px rgba(12,29,48,0.12), 0 1px 0 rgba(255,255,255,0.6) inset',
} as const;

export const primitives = {
  colors,
  typography,
  spacing,
  radius,
  opacity,
  transition,
  shadow,
} as const;
