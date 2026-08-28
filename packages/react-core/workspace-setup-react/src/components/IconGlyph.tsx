"use client";

/**
 * Renders an iconId as an inline SVG — never as a network image.
 *
 * The dock editor used to preview icons with `<img src={iconIdToSvgUrl(id)}>`,
 * and for a lucide icon that URL points at `api.iconify.design`. So picking an
 * icon left the swatch empty until a CDN round-trip finished — and on a network
 * that blocks it, empty for good. That is why a freshly-picked icon appeared
 * not to "take".
 *
 * Inline SVG also inherits `currentColor`, so an icon recolours with the theme
 * instead of being baked to whatever colour the URL was built with.
 */

import { useMemo } from "react";
import { DynamicIcon } from "@wellsfargo-starui/design-system/icons/react";
import { MARKET_ICON_SVGS } from "@wellsfargo-starui/design-system/icons/all-icons";
import { cn } from "@wellsfargo-starui/react";

/** Market SVGs ship at 24px; resize once per (key,size) and keep it. */
const sizedMarketSvg = new Map<string, string>();

export function marketSvgAt(key: string, size: number): string {
  const cacheKey = `${key}@${size}`;
  const hit = sizedMarketSvg.get(cacheKey);
  if (hit !== undefined) return hit;
  const raw = MARKET_ICON_SVGS[key];
  const sized = raw
    ? raw.replace(/width="24"/g, `width="${size}"`).replace(/height="24"/g, `height="${size}"`)
    : "";
  sizedMarketSvg.set(cacheKey, sized);
  return sized;
}

/**
 * Whether an icon follows the surrounding colour.
 *
 * Monochrome icons are drawn with `currentColor`, so they adapt to the theme
 * and can be recoloured. The curated trading glyphs ship hardcoded hex to keep
 * their colour identity in both themes — `svgToDataUrl`'s currentColor
 * replacement is a no-op for those, so offering to recolour one would be a
 * control that silently does nothing.
 *
 * Lucide icons are always stroke="currentColor".
 */
export function isRecolorableIcon(iconId: string | undefined): boolean {
  if (!iconId) return false;
  if (!iconId.startsWith("mkt:")) return true;
  return (MARKET_ICON_SVGS[iconId.slice(4)] ?? "").includes("currentColor");
}

export interface IconGlyphProps {
  /** "mkt:bond" | "lucide:home" */
  iconId: string | undefined;
  size?: number;
  className?: string;
  /**
   * Explicit colour for the `currentColor` parts. Omit to inherit from the
   * surrounding text colour, which is what keeps icons theme-adaptive.
   */
  color?: string;
}

export function IconGlyph({ iconId, size = 16, className, color }: IconGlyphProps) {
  const marketKey = iconId?.startsWith("mkt:") ? iconId.slice(4) : undefined;
  const markup = useMemo(
    () => (marketKey ? marketSvgAt(marketKey, size) : ""),
    [marketKey, size],
  );

  if (!iconId) return null;

  if (marketKey) {
    return (
      <span
        aria-hidden
        data-icon-id={iconId}
        className={cn("inline-flex items-center justify-center", className)}
        style={{ width: size, height: size, ...(color ? { color } : null) }}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  }

  // DynamicIcon renders lucide inline from a curated map, falling back to a
  // CDN <img> only for ids it doesn't know.
  return (
    <span
      aria-hidden
      data-icon-id={iconId}
      className={cn("inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <DynamicIcon icon={iconId} style={{ width: size, height: size }} />
    </span>
  );
}
