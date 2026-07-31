// ─────────────────────────────────────────────────────────────
//  STARUI — canonical hex token packs
//  Source: starui-tokens.css (Binance-inspired trading palette).
//  Cyan signature accent · mint-teal buy/up · rose sell/down.
// ─────────────────────────────────────────────────────────────

import { hexToHslChannel } from '../internal/wcag';

/** Raw STARUI surface + semantic hex pack (maps to --st-* in CSS). */
export interface StaruiHexPack {
  bg: string;
  bg1: string;
  bg2: string;
  bg3: string;
  t0: string;
  t1: string;
  t2: string;
  t3: string;
  border: string;
  border2: string;
  divider: string;
  accent: string;
  accentHover: string;
  accentFg: string;
  accentSoft: string;
  accentRing: string;
  buy: string;
  buyHover: string;
  buyFg: string;
  buySoft: string;
  buyRing: string;
  sell: string;
  sellHover: string;
  sellFg: string;
  sellSoft: string;
  sellRing: string;
  warn: string;
  warnSoft: string;
  warnRing: string;
  info: string;
  infoSoft: string;
  infoRing: string;
  purple: string;
  neutralSoft: string;
  neutralRing: string;
  hoverOverlay: string;
  selection: string;
  disabledBg: string;
  disabledFg: string;
  scrollbar: string;
  bidFill: string;
  askFill: string;
  shadowCard: string;
  shadowOverlay: string;
  glowFocus: string;
}

export const staruiHex = {
  dark: {
    bg: '#0b0d10',
    bg1: '#14171b',
    bg2: '#1c2025',
    bg3: '#252a31',
    t0: '#ecf0f5',
    t1: '#aab3bf',
    t2: '#7d8694',
    t3: '#565d68',
    border: '#2b3139',
    border2: '#3e4552',
    divider: '#21262d',
    accent: '#22d3ee',
    accentHover: '#4ae0f2',
    accentFg: '#06232b',
    accentSoft: 'rgba(34,211,238,0.12)',
    accentRing: 'rgba(34,211,238,0.45)',
    buy: '#22e3a8',
    buyHover: '#3fecb8',
    buyFg: '#07251b',
    buySoft: 'rgba(34,227,168,0.12)',
    buyRing: 'rgba(34,227,168,0.40)',
    sell: '#ff5a82',
    sellHover: '#ff7898',
    sellFg: '#2a0810',
    sellSoft: 'rgba(255,90,130,0.12)',
    sellRing: 'rgba(255,90,130,0.40)',
    warn: '#f5c14b',
    warnSoft: 'rgba(245,193,75,0.13)',
    warnRing: 'rgba(245,193,75,0.40)',
    info: '#22d3ee',
    infoSoft: 'rgba(34,211,238,0.12)',
    infoRing: 'rgba(34,211,238,0.45)',
    purple: '#a78bfa',
    neutralSoft: 'rgba(170,179,191,0.10)',
    neutralRing: 'rgba(170,179,191,0.25)',
    hoverOverlay: 'rgba(255,255,255,0.05)',
    selection: 'rgba(34,211,238,0.22)',
    disabledBg: '#252a31',
    disabledFg: '#565d68',
    scrollbar: '#3e4552',
    bidFill: 'rgba(34,227,168,0.16)',
    askFill: 'rgba(255,90,130,0.16)',
    shadowCard: '0 1px 0 rgba(255,255,255,0.04) inset, 0 2px 6px rgba(0,0,0,0.5)',
    shadowOverlay: '0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4)',
    glowFocus: '0 0 0 2px rgba(34,211,238,0.40), 0 0 24px rgba(34,211,238,0.16)',
  },
  lightClinical: {
    bg: '#f4f6f8',
    bg1: '#ffffff',
    bg2: '#eef1f4',
    bg3: '#e3e8ee',
    t0: '#0f172a',
    t1: '#334155',
    t2: '#64748b',
    t3: '#94a3b8',
    border: '#dce2e9',
    border2: '#c2cad4',
    divider: '#eef1f4',
    accent: '#0891b2',
    accentHover: '#0e7490',
    accentFg: '#ffffff',
    accentSoft: 'rgba(8,145,178,0.10)',
    accentRing: 'rgba(8,145,178,0.32)',
    buy: '#0d9488',
    buyHover: '#0b7a70',
    buyFg: '#ffffff',
    buySoft: 'rgba(13,148,136,0.10)',
    buyRing: 'rgba(13,148,136,0.32)',
    sell: '#e11d48',
    sellHover: '#be123c',
    sellFg: '#ffffff',
    sellSoft: 'rgba(225,29,72,0.09)',
    sellRing: 'rgba(225,29,72,0.30)',
    warn: '#c2410c',
    warnSoft: 'rgba(194,65,12,0.10)',
    warnRing: 'rgba(194,65,12,0.32)',
    info: '#0891b2',
    infoSoft: 'rgba(8,145,178,0.09)',
    infoRing: 'rgba(8,145,178,0.30)',
    purple: '#7c3aed',
    neutralSoft: 'rgba(51,65,85,0.07)',
    neutralRing: 'rgba(51,65,85,0.20)',
    hoverOverlay: 'rgba(15,23,42,0.04)',
    selection: 'rgba(8,145,178,0.16)',
    disabledBg: '#eef1f4',
    disabledFg: '#94a3b8',
    scrollbar: '#c2cad4',
    bidFill: 'rgba(13,148,136,0.10)',
    askFill: 'rgba(225,29,72,0.09)',
    shadowCard: '0 1px 2px rgba(15,23,42,0.06)',
    shadowOverlay: '0 1px 2px rgba(15,23,42,0.08), 0 8px 22px rgba(15,23,42,0.10)',
    glowFocus: '0 0 0 3px rgba(8,145,178,0.18)',
  },
  lightPaper: {
    bg: '#efede9',
    bg1: '#fbf8f2',
    bg2: '#ece6da',
    bg3: '#e0d8c8',
    t0: '#2a2519',
    t1: '#524a38',
    t2: '#6d6550',
    t3: '#8a806a',
    border: '#d3c9b5',
    border2: '#b4a98f',
    divider: '#e2dac9',
    accent: '#0e7490',
    accentHover: '#155e75',
    accentFg: '#ffffff',
    accentSoft: 'rgba(14,116,144,0.10)',
    accentRing: 'rgba(14,116,144,0.32)',
    buy: '#0f766e',
    buyHover: '#0c5e58',
    buyFg: '#ffffff',
    buySoft: 'rgba(15,118,110,0.10)',
    buyRing: 'rgba(15,118,110,0.32)',
    sell: '#be123c',
    sellHover: '#9f0f33',
    sellFg: '#ffffff',
    sellSoft: 'rgba(190,18,60,0.09)',
    sellRing: 'rgba(190,18,60,0.30)',
    warn: '#b45309',
    warnSoft: 'rgba(180,83,9,0.10)',
    warnRing: 'rgba(180,83,9,0.32)',
    info: '#0e7490',
    infoSoft: 'rgba(14,116,144,0.09)',
    infoRing: 'rgba(14,116,144,0.30)',
    purple: '#6d28d9',
    neutralSoft: 'rgba(82,74,56,0.07)',
    neutralRing: 'rgba(82,74,56,0.22)',
    hoverOverlay: 'rgba(42,37,25,0.045)',
    selection: 'rgba(14,116,144,0.16)',
    disabledBg: '#ece6da',
    disabledFg: '#8a806a',
    scrollbar: '#b4a98f',
    bidFill: 'rgba(15,118,110,0.11)',
    askFill: 'rgba(190,18,60,0.10)',
    shadowCard: '0 1px 2px rgba(42,37,25,0.06)',
    shadowOverlay: '0 1px 2px rgba(42,37,25,0.08), 0 8px 22px rgba(42,37,25,0.12)',
    glowFocus: '0 0 0 3px rgba(14,116,144,0.18)',
  },
} as const satisfies Record<string, StaruiHexPack>;

/** shadcn HSL channel triplets derived from STARUI hex. */
export function buildShadcnFromStarui(h: StaruiHexPack) {
  const hsl = (hex: string) => hexToHslChannel(hex);
  return {
    background: hsl(h.bg),
    foreground: hsl(h.t0),
    card: hsl(h.bg1),
    cardForeground: hsl(h.t0),
    popover: hsl(h.bg1),
    popoverForeground: hsl(h.t0),
    primary: hsl(h.accent),
    primaryForeground: hsl(h.accentFg),
    secondary: hsl(h.bg2),
    secondaryForeground: hsl(h.t1),
    muted: hsl(h.bg2),
    mutedForeground: hsl(h.t2),
    accent: hsl(h.accent),
    accentForeground: hsl(h.accentFg),
    destructive: hsl(h.sell),
    destructiveForeground: hsl(h.sellFg),
    border: hsl(h.border),
    input: hsl(h.border),
    ring: hsl(h.accent),
    sidebarBackground: hsl(h.bg),
    sidebarForeground: hsl(h.t0),
    sidebarPrimary: hsl(h.accent),
    sidebarPrimaryForeground: hsl(h.accentFg),
    sidebarAccent: hsl(h.bg2),
    sidebarAccentForeground: hsl(h.t0),
    sidebarBorder: hsl(h.border),
    sidebarRing: hsl(h.accent),
    chart1: hsl(h.accent),
    chart2: hsl(h.buy),
    chart3: hsl(h.warn),
    chart4: hsl(h.purple),
    chart5: hsl(h.sell),
  };
}

/** AG Grid v33+ color pack — aligned with starui-aggrid.jsx token mapping. */
export function buildAgGridFromStarui(h: StaruiHexPack, mode: 'dark' | 'light') {
  return {
    bg: h.bg1,
    fg: h.t0,
    chrome: h.bg2,
    header: h.bg2,
    headerText: h.t2,
    odd: mode === 'dark' ? 'rgba(255,255,255,0.012)' : 'rgba(0,0,0,0.014)',
    hover: h.bg2,
    sel: h.accentSoft,
    border: h.border,
    rowBorder: h.divider,
    accent: h.accent,
    accentSoft: h.accentSoft,
    inputBg: h.bg,
    inputBorder: h.border,
    inputFocus: h.accent,
    menu: h.bg2,
    menuText: h.t0,
    menuBorder: h.border,
    tooltip: h.bg3,
    tooltipText: h.t0,
    toggleOff: h.bg3,
  };
}
