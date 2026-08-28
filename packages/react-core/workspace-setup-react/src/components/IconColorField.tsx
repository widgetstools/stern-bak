"use client";

/**
 * Colour override for a dock item's icon.
 *
 * The dock config has always carried `iconColor`, and `makeDualIcon` already
 * honours it — the editor just never offered a way to set it, so it was pinned
 * to "" at creation and never changed.
 *
 * Two things shape this control:
 *
 *  1. **The default is "follow theme", and it is genuinely better.** With no
 *     `iconColor`, `makeDualIcon` emits *separate* dark and light URLs, so the
 *     icon tracks the theme. Choosing a fixed colour collapses both to one URL
 *     — the icon then keeps that colour in both themes. That is a real
 *     trade-off, so the control says so rather than letting the user discover
 *     it after switching theme.
 *  2. **Swatches are concrete hex, not CSS variables.** The colour is baked
 *     into an SVG data URL, and a data URL is its own document — `var(--x)`
 *     resolves to nothing there. These are the same fixed-palette colours the
 *     curated trading glyphs already use, so they read on both themes.
 */

import { Check, Ban } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, cn } from "@wellsfargo-starui/react";
import { IconGlyph, isRecolorableIcon } from "./IconGlyph";

export interface IconSwatch {
  /** Concrete hex — see the note above on why this cannot be a token. */
  value: string;
  label: string;
}

export const ICON_COLOR_SWATCHES: readonly IconSwatch[] = [
  { value: "#5b8cff", label: "Blue" },
  { value: "#22d3ee", label: "Cyan" },
  { value: "#1ed8a0", label: "Green" },
  { value: "#ffb547", label: "Amber" },
  { value: "#ff4d7d", label: "Pink" },
  { value: "#a78bfa", label: "Violet" },
  { value: "#e5e7eb", label: "Light" },
  { value: "#6b7280", label: "Grey" },
];

interface IconColorFieldProps {
  iconId: string;
  /** Empty string means "follow the theme". */
  iconColor: string;
  onChange: (iconColor: string) => void;
}

export function IconColorField({ iconId, iconColor, onChange }: IconColorFieldProps) {
  const recolorable = isRecolorableIcon(iconId);
  // Two different reasons to be unavailable, and they need different wording:
  // there is nothing to colour yet, versus this icon's palette is deliberate.
  const disabledReason = !iconId
    ? "Pick an icon first"
    : "This icon ships with a fixed palette, so a colour override would do nothing";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Colour</span>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={!recolorable}
            aria-label={
              recolorable
                ? `Icon colour: ${iconColor || "follows theme"}. Click to change.`
                : disabledReason
            }
            title={
              recolorable
                ? iconColor
                  ? `Fixed colour ${iconColor} — click to change`
                  : "Follows the theme — click to set a fixed colour"
                : disabledReason
            }
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-md transition-colors",
              "bg-[var(--ds-surface-secondary)] border border-[var(--ds-border-primary)]",
              "hover:border-[var(--ds-border-focus)] hover:bg-[var(--ds-surface-hover)]",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ds-state-focus-ring)]",
              "disabled:opacity-40 disabled:pointer-events-none",
            )}
          >
            {iconColor ? (
              <span
                className="h-4 w-4 rounded-full border border-black/20"
                style={{ background: iconColor }}
              />
            ) : (
              // The theme-following state is shown as the icon itself, in the
              // current theme's colour — which is exactly what it means.
              <IconGlyph iconId={iconId} size={18} className="text-[var(--ds-text-primary)]" />
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[212px] p-2 bg-[var(--ds-surface-overlay,var(--ds-surface-primary))] border-[var(--ds-border-primary)] text-foreground shadow-lg"
          align="start"
        >
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onChange("")}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors",
                "hover:bg-[var(--ds-surface-hover)]",
                !iconColor && "bg-[var(--ds-surface-selected)]",
              )}
            >
              <IconGlyph iconId={iconId} size={16} className="text-[var(--ds-text-primary)]" />
              <span className="flex-1">Follow theme</span>
              {!iconColor && <Check className="h-3 w-3" />}
            </button>

            <div className="grid grid-cols-4 gap-1.5">
              {ICON_COLOR_SWATCHES.map((swatch) => {
                const selected = iconColor.toLowerCase() === swatch.value.toLowerCase();
                return (
                  <button
                    key={swatch.value}
                    type="button"
                    title={swatch.label}
                    aria-label={swatch.label}
                    aria-pressed={selected}
                    onClick={() => onChange(swatch.value)}
                    className={cn(
                      "h-8 w-full rounded-md border flex items-center justify-center transition-colors",
                      selected
                        ? "border-[var(--ds-border-focus)]"
                        : "border-[var(--ds-border-primary)] hover:border-[var(--ds-border-focus)]",
                    )}
                  >
                    <IconGlyph iconId={iconId} size={16} color={swatch.value} />
                  </button>
                );
              })}
            </div>

            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="shrink-0">Custom</span>
              <input
                type="color"
                value={iconColor || "#5b8cff"}
                onChange={(e) => onChange(e.target.value)}
                aria-label="Custom icon colour"
                className="h-6 w-full cursor-pointer rounded border border-[var(--ds-border-primary)] bg-transparent p-0.5"
              />
            </label>

            <p className="text-[10px] leading-relaxed text-muted-foreground border-t border-[var(--ds-border-primary)] pt-1.5">
              {iconColor ? (
                <>
                  <Ban className="inline h-2.5 w-2.5 mr-1 -mt-px" />
                  Fixed colour — the icon keeps this in both dark and light.
                </>
              ) : (
                <>Following the theme — the icon is drawn light on dark and dark on light.</>
              )}
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
