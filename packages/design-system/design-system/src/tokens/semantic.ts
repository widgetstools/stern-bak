// ─────────────────────────────────────────────────────────────
//  STARUI — Semantic Tokens
//  Three themes: dark (Graphite), light clinical, light paper.
//  Canonical hex: tokens/staruiHex.ts
// ─────────────────────────────────────────────────────────────

import { colors, typography, radius, spacing, opacity, transition, shadow } from './primitives';
import {
  staruiHex,
  buildShadcnFromStarui,
  type StaruiHexPack,
} from './staruiHex';

export type ShadcnTokenPack = ReturnType<typeof buildShadcnFromStarui>;

// ── Color Scheme Type ──
export interface ColorScheme {
  primary: {
    color:      string;
    hover:      string;
    display:    string;
    highlight:  string;
    pressed:    string;
    foreground: string;
    soft:       string;
    ring:       string;
  };
  surface: {
    ground:     string;
    sunken:     string;
    primary:    string;
    secondary:  string;
    tertiary:   string;
    quaternary: string;
    muted:      string;
    popover:    string;
  };
  text: {
    primary:   string;
    secondary: string;
    muted:     string;
    faint:     string;
    disabled:  string;
  };
  border: {
    primary:   string;
    secondary: string;
    tertiary:  string;
    divider:   string;
  };
  accent: {
    positive:      string;
    positiveHover: string;
    negative:      string;
    negativeHover: string;
    warning:       string;
    info:          string;
    infoHover:     string;
    highlight:     string;
    purple:        string;
  };
  trade: {
    flat:          string;
    positiveStrip: string;
    negativeStrip: string;
    bidFill:       string;
    askFill:       string;
  };
  action: {
    buyBg:    string;
    buyText:  string;
    sellBg:   string;
    sellText: string;
  };
  state: {
    focusRing:    string;
    focusRingBg:  string;
    disabledBg:   string;
    disabledFg:   string;
    hoverOverlay: string;
    selection:    string;
  };
  overlay: {
    positiveSoft:  string;
    negativeSoft:  string;
    warningSoft:   string;
    infoSoft:      string;
    positiveRing:  string;
    negativeRing:  string;
    warningRing:   string;
    infoRing:      string;
    neutralSoft:   string;
    neutralRing:   string;
  };
  chart: readonly [string, string, string, string, string];
  sidebar: {
    background:          string;
    foreground:            string;
    primary:               string;
    primaryForeground:     string;
    accent:                string;
    accentForeground:      string;
    border:                string;
    ring:                  string;
  };
  cvd: {
    buy:  string;
    sell: string;
  };
  scrollbar: string;
  elevation: {
    card:    string;
    overlay: string;
    glow:    string;
  };
  shadcn: ShadcnTokenPack;
}

function schemeFromStarui(
  h: StaruiHexPack,
  shadcn: ShadcnTokenPack,
  mode: 'dark' | 'light',
): ColorScheme {
  const isDark = mode === 'dark';
  return {
    primary: {
      color:      h.accent,
      hover:      h.accentHover,
      display:    h.accent,
      highlight:  h.accentHover,
      pressed:    h.accentHover,
      foreground: h.accentFg,
      soft:       h.accentSoft,
      ring:       h.accentRing,
    },
    surface: {
      ground:     h.bg,
      sunken:     h.bg1,
      primary:    h.bg1,
      secondary:  h.bg2,
      tertiary:   h.bg3,
      quaternary: h.border2,
      muted:      h.bg2,
      popover:    h.bg1,
    },
    text: {
      primary:   h.t0,
      secondary: h.t1,
      muted:     h.t2,
      faint:     h.t3,
      disabled:  h.disabledFg,
    },
    border: {
      primary:   h.border,
      secondary: h.border2,
      tertiary:  h.border2,
      divider:   h.divider,
    },
    accent: {
      positive:      h.buy,
      positiveHover: h.buyHover,
      negative:      h.sell,
      negativeHover: h.sellHover,
      warning:       h.warn,
      info:          h.info,
      infoHover:     h.accentHover,
      highlight:     h.accent,
      purple:        h.purple,
    },
    trade: {
      flat:          h.t2,
      positiveStrip: h.buySoft,
      negativeStrip: h.sellSoft,
      bidFill:       h.bidFill,
      askFill:       h.askFill,
    },
    action: {
      buyBg:    h.buy,
      buyText:  h.buyFg,
      sellBg:   h.sell,
      sellText: h.sellFg,
    },
    state: {
      focusRing:    h.accent,
      focusRingBg:  h.accentSoft,
      disabledBg:   h.disabledBg,
      disabledFg:   h.disabledFg,
      hoverOverlay: h.hoverOverlay,
      selection:    h.selection,
    },
    overlay: {
      positiveSoft: h.buySoft,
      positiveRing: h.buyRing,
      negativeSoft: h.sellSoft,
      negativeRing: h.sellRing,
      warningSoft:  h.warnSoft,
      warningRing:  h.warnRing,
      infoSoft:     h.infoSoft,
      infoRing:     h.infoRing,
      neutralSoft:  h.neutralSoft,
      neutralRing:  h.neutralRing,
    },
    chart: [h.accent, h.buy, h.warn, h.purple, h.sell],
    sidebar: {
      background:        h.bg,
      foreground:        h.t0,
      primary:           h.accent,
      primaryForeground: h.accentFg,
      accent:            h.bg2,
      accentForeground:  h.t0,
      border:            h.border,
      ring:              h.accent,
    },
    cvd: {
      buy:  isDark ? colors.cvd.buyDark : colors.cvd.buyLight,
      sell: isDark ? colors.cvd.sellDark : colors.cvd.sellLight,
    },
    scrollbar: h.scrollbar,
    elevation: {
      card:    h.shadowCard,
      overlay: h.shadowOverlay,
      glow:    h.glowFocus,
    },
    shadcn,
  };
}

export const dark: ColorScheme = schemeFromStarui(
  staruiHex.dark,
  buildShadcnFromStarui(staruiHex.dark),
  'dark',
);

/** Default light theme — STARUI "clinical" (Studio). */
export const light: ColorScheme = schemeFromStarui(
  staruiHex.lightClinical,
  buildShadcnFromStarui(staruiHex.lightClinical),
  'light',
);

/** STARUI "paper" light variant — warm cream chrome. */
export const lightPaper: ColorScheme = schemeFromStarui(
  staruiHex.lightPaper,
  buildShadcnFromStarui(staruiHex.lightPaper),
  'light',
);

export const shared = {
  typography,
  radius,
  spacing,
  opacity,
  transition,
  shadow,
} as const;

export const semantic = { dark, light, lightPaper, shared } as const;
