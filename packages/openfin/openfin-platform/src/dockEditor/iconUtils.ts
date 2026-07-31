/**
 * Icon utilities for the dock editor.
 *
 * Supports two icon sources:
 * 1. Lucide icons via Iconify CDN — iconId format: "lucide:icon-name"
 * 2. Custom market icons from @wellsfargo-starui/icons-svg — iconId format: "mkt:icon-name"
 *
 * Custom market icons are embedded as SVG strings and converted to data URLs
 * with the requested color applied (replacing currentColor).
 */

import { marketIconToDataUrl } from "@wellsfargo-starui/icons-svg/all-icons";
import { buildOpenFinPalettesFromDesignSystem } from "../openfinPalette";

function resolveThemedIconColors(): { dark: string; light: string } {
  const palettes = buildOpenFinPalettesFromDesignSystem();
  return {
    dark: palettes.dark.textDefault ?? "#FFFFFF",
    light: palettes.light.textDefault ?? "#1E1F23",
  };
}

// The rendered height of each icon in pixels.
const ICON_HEIGHT = 24;

// Fallback icon used when no icon has been selected or a URL cannot be parsed.
const DEFAULT_ICON_NAME = "FileText";
const DEFAULT_ICON_ID   = "lucide:file-text";

/**
 * Build an SVG URL for the given icon ID and color.
 *
 * - "lucide:home"   → Iconify CDN URL
 * - "mkt:bond"      → inline data URL from @wellsfargo-starui/icons-svg
 *
 * @param iconId - Icon ID in "prefix:name" format
 * @param color  - Hex color for the icon stroke/fill (default: white)
 */
export function iconIdToSvgUrl(iconId: string, color?: string): string {
  const defaultDark = resolveThemedIconColors().dark;
  const resolvedColor = color ?? defaultDark;
  const [prefix, name] = iconId.split(":");
  if (!prefix || !name) return "";

  // Custom market icons — resolve from embedded SVG strings
  if (prefix === "mkt") {
    return marketIconToDataUrl(name, resolvedColor);
  }

  // Iconify CDN icons (lucide, etc.)
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
