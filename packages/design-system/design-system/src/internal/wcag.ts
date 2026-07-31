// ─────────────────────────────────────────────────────────────
//  WCAG contrast utilities — used by adapters + audit script.
//  Pure TS, no deps. Hex strings only (#rgb / #rrggbb).
// ─────────────────────────────────────────────────────────────

export interface Rgb { r: number; g: number; b: number; }

export function hexToRgb(hex: string): Rgb {
  const v = hex.replace(/^#/, '');
  const expanded = v.length === 3
    ? v.split('').map((c) => c + c).join('')
    : v;
  if (expanded.length !== 6) throw new Error(`Invalid hex: ${hex}`);
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function relLuminance({ r, g, b }: Rgb): number {
  const norm = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * norm(r) + 0.7152 * norm(g) + 0.0722 * norm(b);
}

/** WCAG 2.1 contrast ratio between two hex colors. */
export function contrastRatio(fg: string, bg: string): number {
  const lf = relLuminance(hexToRgb(fg));
  const lb = relLuminance(hexToRgb(bg));
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

/** Convert hex to HSL channel string ("210 14% 23%") for shadcn vars. */
export function hexToHslChannel(hex: string): string {
  const { r: rr, g: gg, b: bb } = hexToRgb(hex);
  const r = rr / 255, g = gg / 255, b = bb / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
