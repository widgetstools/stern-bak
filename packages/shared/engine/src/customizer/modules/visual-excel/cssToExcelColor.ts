/** Fallback hex when CSS variables cannot be resolved (SSR / headless). */
const DS_TOKEN_HEX: Record<string, string> = {
  '--ds-accent-positive': '#22C55E',
  '--ds-accent-negative': '#EF4444',
  '--ds-accent-warning': '#F59E0B',
  '--ds-accent-info': '#3B82F6',
  '--ds-text-primary': '#111827',
  '--ds-text-secondary': '#6B7280',
  '--ds-surface-primary': '#FFFFFF',
  '--ds-surface-secondary': '#F3F4F6',
  '--ds-surface-ground': '#E5E7EB',
};

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

function parseRgbLike(value: string): string | undefined {
  const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!m) return undefined;
  return rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]));
}

/**
 * Resolve a CSS colour (hex, rgb, or design-system var) to an Excel-friendly
 * `#RRGGBB` string. Returns undefined when the value cannot be resolved.
 */
export function cssToExcelColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^#[0-9A-F]{3,8}$/i.test(trimmed)) {
    if (trimmed.length === 4) {
      const [, r, g, b] = trimmed;
      return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return trimmed.slice(0, 7).toUpperCase();
  }

  const rgb = parseRgbLike(trimmed);
  if (rgb) return rgb;

  const varMatch = trimmed.match(/^var\(\s*(--[^,)]+)/);
  if (varMatch) {
    const token = varMatch[1];
    if (typeof document !== 'undefined') {
      const resolved = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
      if (resolved) return cssToExcelColor(resolved);
    }
    return DS_TOKEN_HEX[token]?.toUpperCase();
  }

  if (/^[a-z]+$/i.test(trimmed)) {
    return trimmed.toLowerCase() === 'transparent' ? undefined : trimmed;
  }

  return undefined;
}
