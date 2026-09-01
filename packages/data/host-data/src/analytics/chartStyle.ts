/**
 * Presentation options for a rendered chart.
 *
 * Deliberately SEMANTIC rather than raw colours. "Make the legend brighter"
 * is a real request, but answering it with an arbitrary hex would put the
 * chart outside the design system (which the `check:ds-tokens` gate rejects),
 * break in the other theme, and let a chart drift into looking garish one
 * widget at a time. Each option below names an intent and resolves to design
 * tokens, so both themes stay correct and every chart stays on-brand.
 */

/**
 * How prominent the axis ticks, legend and labels are.
 *
 * `muted` is the default: chart chrome is deliberately quiet so the data
 * marks carry the eye. `normal` and `high` exist because that default is too
 * quiet on a large or projected panel — which is exactly the complaint this
 * was added for.
 */
export const LABEL_CONTRASTS = ['muted', 'normal', 'high'] as const;
export type LabelContrast = (typeof LABEL_CONTRASTS)[number];

/** How colour is assigned to marks. `auto` applies the rule in `chartSpec`. */
export const CHART_PALETTES = ['auto', 'single', 'categorical', 'sign'] as const;
export type ChartPalette = (typeof CHART_PALETTES)[number];

export interface ChartStyle {
  /** Axis-tick, legend and label prominence. Default `muted`. */
  labelContrast?: LabelContrast;
  /** Background grid lines. Default true. */
  showGrid?: boolean;
  /** Legend, where the chart kind has one (pie). Default true. */
  showLegend?: boolean;
  /**
   * Override the colour rule: `single` forces one series hue, `categorical`
   * the chart ramp, `sign` red/green by sign. `auto` (the default) picks per
   * chart kind and whether the measure crosses zero.
   */
  palette?: ChartPalette;
}

/**
 * Tailwind arbitrary-variant classes that re-target recharts' axis-tick and
 * legend text. The shadcn `ChartContainer` hardcodes
 * `fill-muted-foreground` on tick text, so raising contrast means overriding
 * that same selector rather than setting a colour on the axis component.
 */
export function labelContrastClass(contrast: LabelContrast | undefined): string {
  switch (contrast) {
    case 'high':
      return '[&_.recharts-cartesian-axis-tick_text]:fill-foreground [&_.recharts-legend-item-text]:!text-foreground';
    case 'normal':
      return '[&_.recharts-cartesian-axis-tick_text]:fill-foreground/75 [&_.recharts-legend-item-text]:!text-foreground/75';
    default:
      return '';
  }
}
