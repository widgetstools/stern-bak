/**
 * Icon utilities for the dock editor.
 *
 * Supports two icon sources, both resolved OFFLINE:
 * 1. Lucide icons bundled with the design system — iconId format:
 *    "lucide:icon-name" — rendered to an SVG string and inlined as a data
 *    URL. Ids outside the bundled set fall back to the Iconify CDN.
 * 2. Custom market icons from @wellsfargo-starui/icons-svg — iconId format:
 *    "mkt:icon-name" — embedded SVG strings.
 *
 * Both are converted to data URLs with the requested color applied
 * (replacing currentColor).
 */

import { marketIconToDataUrl, svgToDataUrl } from "@wellsfargo-starui/design-system/icons/all-icons";
import { lucideIconToSvg } from "@wellsfargo-starui/design-system/icons/react";
import { buildOpenFinPalettesFromDesignSystem } from "../openfinPalette";

// Resolving the palette flips the document's theme attribute to dark and
// to light and reads ~40 computed colours — a full style recalculation of
// the whole page, twice. The result is a function of the design-system
// tokens, which never change at runtime, so compute it once per document.
// (Before this cache the editor paid it once per icon per render: every
// keystroke in Workspace Setup re-themed the page dozens of times.)
let themedIconColorsCache: { dark: string; light: string } | null = null;

function resolveThemedIconColors(): { dark: string; light: string } {
  if (themedIconColorsCache) return themedIconColorsCache;
  const palettes = buildOpenFinPalettesFromDesignSystem();
  const colors = {
    dark: palettes.dark.textDefault ?? "#FFFFFF",
    light: palettes.light.textDefault ?? "#1E1F23",
  };
  // Only remember a real resolution; without a document the builder returns
  // its fallbacks, which must not shadow the tokens once the DOM exists.
  if (typeof document !== "undefined" && document.body) themedIconColorsCache = colors;
  return colors;
}

/** Test-only: forget the cached palette colours. */
export function __resetThemedIconColorsForTests(): void {
  themedIconColorsCache = null;
}

// The rendered height of each icon in pixels.
const ICON_HEIGHT = 24;

// Fallback icon used when no icon has been selected or a URL cannot be parsed.
const DEFAULT_ICON_NAME = "FileText";
const DEFAULT_ICON_ID   = "lucide:file-text";

/**
 * Build an SVG URL for the given icon ID and color.
 *
 * - "lucide:home"   → inline data URL from the bundled lucide set
 *                     (Iconify CDN only for an id outside the set)
 * - "mkt:bond"      → inline data URL from @wellsfargo-starui/icons-svg
 *
 * @param iconId - Icon ID in "prefix:name" format
 * @param color  - Hex color for the icon stroke/fill (default: the dark
 *                 theme's text colour)
 */
export function iconIdToSvgUrl(iconId: string, color?: string): string {
  const [prefix, name] = iconId.split(":");
  if (!prefix || !name) return "";
  const resolvedColor = color ?? resolveThemedIconColors().dark;

  // Custom market icons — resolve from embedded SVG strings
  if (prefix === "mkt") {
    return marketIconToDataUrl(name, resolvedColor);
  }

  // Bundled lucide icons — no network; the dock renders offline.
  if (prefix === "lucide") {
    const svg = lucideIconToSvg(iconId, { size: ICON_HEIGHT });
    if (svg) return svgToDataUrl(svg, resolvedColor);
  }

  // Iconify CDN for anything else (an id outside the bundled set)
  return `https://api.iconify.design/${prefix}/${name}.svg?color=${encodeURIComponent(resolvedColor)}&height=${ICON_HEIGHT}`;
}

/**
 * Build both dark-theme and light-theme icon URLs for a given icon ID.
 */
export function iconIdToThemedUrls(iconId: string): { dark: string; light: string } {
  const { dark, light } = resolveThemedIconColors();
  return {
    dark:  iconIdToSvgUrl(iconId, dark),
    light: iconIdToSvgUrl(iconId, light),
  };
}

/**
 * Extract the icon ID from an existing icon URL.
 * Handles both Iconify CDN URLs and data URLs from custom market icons.
 */
export function parseIconUrl(iconUrl: string | undefined): { iconName: string; iconId: string } {
  if (!iconUrl) {
    return { iconName: DEFAULT_ICON_NAME, iconId: DEFAULT_ICON_ID };
  }

  // Iconify CDN URL
  const match = iconUrl.match(/api\.iconify\.design\/([^/]+)\/([^.?]+)/);
  if (match) {
    const prefix = match[1];
    const name   = match[2];
    const displayName = name.replace(/(^|-)(\w)/g, (_, __, char: string) => char.toUpperCase());
    return { iconName: displayName, iconId: `${prefix}:${name}` };
  }

  // Data URL — could be a custom market icon (we can't reverse-engineer the key easily,
  // so fall back to defaults unless the config stores the iconId separately)
  return { iconName: DEFAULT_ICON_NAME, iconId: DEFAULT_ICON_ID };
}
