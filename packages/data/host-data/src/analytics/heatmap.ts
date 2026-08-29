/**
 * Per-column cell shading for a heatmap-mode analysis table.
 *
 * Diverging (teal/rose) when a column's values meaningfully span both signs —
 * not a bare sign check, since one rounding-noise negative among otherwise
 * positive values shouldn't flip the whole column's palette to "loss". A
 * minority-share threshold instead: the smaller side has to be a real
 * presence, not a blip.
 *
 * Colors resolve through design-system tokens (`oklch(var(--x) / alpha)`),
 * the same pattern already used elsewhere in this codebase
 * (`compatCss.ts`'s `--ob-bid-fill` etc.) — never a hardcoded hex. This is
 * deliberately unlike the unrelated AG-Grid `heatmap` cell renderer, which
 * takes user-authored hex colors and lives in a different layer entirely
 * (an AG-Grid `ICellRenderer`, not reusable in a plain React table).
 */

const DIVERGING_MINORITY_SHARE = 0.08;

export interface HeatmapDomain {
  kind: 'diverging' | 'sequential';
  /** Largest magnitude in the column — the alpha=max reference point. */
  maxAbs: number;
}

/** Computes one column's shading domain from its raw values. `undefined`
 *  when the column has no numeric values to shade at all. */
export function heatmapDomain(values: readonly unknown[]): HeatmapDomain | undefined {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return undefined;
  const negatives = nums.filter((n) => n < 0).length;
  const positives = nums.filter((n) => n > 0).length;
  const minorityShare = Math.min(negatives, positives) / nums.length;
  return {
    kind: minorityShare >= DIVERGING_MINORITY_SHARE ? 'diverging' : 'sequential',
    maxAbs: Math.max(...nums.map((n) => Math.abs(n)), 0),
  };
}

// Dark-theme `--positive`/`--negative`/`--chart-1` are noticeably lighter
// (higher L) than their light-theme counterparts even before alpha is
// applied, so reusing one alpha range for both themes reads washed-out in
// dark mode or blown-out in light mode — each gets its own clamp.
const ALPHA_RANGE = {
  light: { min: 0.08, max: 0.55 },
  dark: { min: 0.10, max: 0.40 },
} as const;

/**
 * Background for one cell, or `undefined` for a blank/non-numeric cell
 * (rendered unshaded) or a column with no domain (nothing to shade against).
 */
export function heatmapCellColor(
  value: unknown,
  domain: HeatmapDomain | undefined,
  theme: 'light' | 'dark',
): string | undefined {
  if (!domain || domain.maxAbs === 0 || typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const { min, max } = ALPHA_RANGE[theme];
  const t = Math.min(1, Math.abs(value) / domain.maxAbs);
  const alpha = (min + t * (max - min)).toFixed(2);
  if (domain.kind === 'sequential') return `oklch(var(--chart-1) / ${alpha})`;
  return value < 0 ? `oklch(var(--negative) / ${alpha})` : `oklch(var(--positive) / ${alpha})`;
}
