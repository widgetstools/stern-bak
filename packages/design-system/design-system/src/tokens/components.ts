// ─────────────────────────────────────────────────────────────
//  FI Design System — Component Tokens
//  Per-component overrides that both shadcn and PrimeNG consume.
//  Values reference semantic-scheme slots, never primitives directly.
//
//  `scheme.primary` is reserved for brand CTAs, focus rings, active tabs,
//  and primary framework hooks. `scheme.accent.*` is reserved for semantic
//  status accents: positive, negative, warning, info, highlight, purple.
// ─────────────────────────────────────────────────────────────

import { typography, radius, spacing } from './primitives';
import type { ColorScheme } from './semantic';
import { controls } from './controls';

export function componentTokens(scheme: ColorScheme) {
  return {
    control: controls,

    button: {
      fontFamily:    typography.fontFamily.sans,
      fontSize:      typography.fontSize.md,
      fontWeight:    typography.fontWeight.semibold,
      // Button motif: subtle optical tightening on caps.
      letterSpacing: typography.letterSpacing.snug,
      borderRadius:  radius.md,
      paddingX:      `${spacing[4]}px`,
      paddingY:      `${spacing[2]}px`,
      // Button heights (sm/default/lg/icon). Reference for
      // the @wellsfargo-starui/react button variants — keep in sync.
      height: {
        sm:      '28px',
        default: '34px',
        lg:      '40px',
        icon:    '34px',
      },
      primary: {
        background:       scheme.primary.color,
        backgroundHover:  scheme.primary.hover,
        color:            scheme.primary.foreground,
      },
      buy: {
        background:       scheme.action.buyBg,
        backgroundHover:  scheme.accent.positiveHover,
        color:            scheme.action.buyText,
      },
      sell: {
        background:       scheme.action.sellBg,
        backgroundHover:  scheme.accent.negativeHover,
        color:            scheme.action.sellText,
      },
      ghost: {
        background:       'transparent',
        backgroundHover:  scheme.state.hoverOverlay,
        color:            scheme.text.secondary,
        // Ghost button has no resting border (transparent);
        // it reads against the surface, lifting only on hover.
        borderColor:      'transparent',
      },
      disabled: {
        background: scheme.state.disabledBg,
        color:      scheme.state.disabledFg,
        opacity:    0.6,
      },
    },

    input: {
      fontFamily:       typography.fontFamily.sans,
      fontSize:         typography.fontSize.sm,
      background:       'transparent',
      color:            scheme.text.primary,
      borderColor:      scheme.border.secondary,
      borderColorHover: scheme.primary.color,
      borderColorFocus: scheme.primary.color,
      focusRingBg:      scheme.state.focusRingBg,
      borderRadius:     radius.sm,
      placeholderColor: scheme.text.muted,
      paddingX:         `${spacing[2.5]}px`,
      paddingY:         `${spacing[1.5]}px`,
      disabledBg:       scheme.state.disabledBg,
      disabledColor:    scheme.state.disabledFg,
    },

    tab: {
      fontFamily:     typography.fontFamily.sans,
      fontSize:       typography.fontSize.sm,
      // Tabs are semibold + snug letter-spacing (the same
      // motif as buttons) so they read as part of the chrome.
      fontWeight:     typography.fontWeight.semibold,
      letterSpacing:  typography.letterSpacing.snug,
      color:          scheme.text.muted,
      colorActive:    scheme.text.primary,
      indicatorColor: scheme.primary.color,
      indicatorWidth: '2px',
      // The 2px underline overlaps the container's 1px bottom-border
      // by -1px, so the indicator sits flush with the tab strip.
      indicatorOffset: '-1px',
      paddingX:       `${spacing[3]}px`,    // 12
      paddingY:       `${spacing[2]}px`,    // 8
    },

    badge: {
      // Pill: sans-serif, uppercase, bold-700, fully rounded,
      // tracked widest (0.06em) for status legibility at small sizes.
      fontFamily:    typography.fontFamily.sans,
      fontSize:      typography.fontSize['2xs'],
      fontWeight:    typography.fontWeight.bold,
      letterSpacing: typography.letterSpacing.widest,
      textTransform: 'uppercase',
      lineHeight:    1.6,
      borderRadius:  radius.full,                // pill (999px)
      paddingX:      `${spacing[2]}px`,          // 8
      paddingY:      '2px',
      filled:    { background: scheme.overlay.positiveSoft, color: scheme.accent.positive, border: scheme.overlay.positiveRing },
      partial:   { background: scheme.overlay.warningSoft,  color: scheme.accent.warning,  border: scheme.overlay.warningRing },
      pending:   { background: scheme.overlay.infoSoft,     color: scheme.accent.info,     border: scheme.overlay.infoRing },
      error:     { background: scheme.overlay.negativeSoft, color: scheme.accent.negative, border: scheme.overlay.negativeRing },
      neutral:   { background: scheme.overlay.neutralSoft,  color: scheme.text.muted,      border: scheme.overlay.neutralRing },
    },

    table: {
      fontFamily:          typography.fontFamily.mono,
      fontSize:            typography.fontSize.sm,
      headerFontSize:      typography.fontSize.xs,
      headerFontWeight:    typography.fontWeight.regular,
      headerLetterSpacing: typography.letterSpacing.wide,
      headerBackground:    scheme.surface.secondary,
      headerColor:         scheme.text.secondary,
      rowBackground:       scheme.surface.primary,
      rowBackgroundHover:  scheme.surface.secondary,
      rowBorderColor:      scheme.border.primary,
      selectedRowBg:       scheme.primary.soft,
      cellPaddingX:        `${spacing[2.5]}px`,
      cellPaddingY:        `${spacing[1.5]}px`,
    },

    card: {
      background:   scheme.surface.primary,
      borderColor:  scheme.border.primary,
      borderRadius: radius.md,
      shadow:       scheme.elevation.card,
      // Card header: 16/16/12 padding, 4px gap (title ↔ desc).
      headerPaddingX: `${spacing[4]}px`,
      headerPaddingTop: `${spacing[4]}px`,
      headerPaddingBottom: `${spacing[3]}px`,
      headerGap:     `${spacing[1]}px`,
      contentPaddingX: `${spacing[4]}px`,
      contentPaddingY: `${spacing[4]}px`,
      footerPaddingX: `${spacing[4]}px`,
      footerPaddingY: `${spacing[3]}px`,
      titleFontSize: typography.fontSize.lg,
      titleFontWeight: typography.fontWeight.semibold,
      titleLetterSpacing: typography.letterSpacing.snug,
      descriptionFontSize: typography.fontSize.sm,
      descriptionLineHeight: 1.5,
    },

    tooltip: {
      fontFamily:   typography.fontFamily.sans,
      fontSize:     typography.fontSize.sm,
      background:   scheme.surface.secondary,
      color:        scheme.text.primary,
      borderColor:  scheme.border.primary,
      borderRadius: radius.sm,
      paddingX:     `${spacing[2.5]}px`,
      paddingY:     `${spacing[1.5]}px`,
    },

    scrollbar: {
      width:      '10px',
      thumbColor: scheme.scrollbar,
      trackColor: 'transparent',
      radius:     radius.lg,
    },
  } as const;
}
