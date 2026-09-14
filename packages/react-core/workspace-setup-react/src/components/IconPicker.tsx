"use client";

/**
 * IconPicker — searchable grid of icons for selecting dock button icons.
 *
 * One catalog, one entry per icon: the curated `ICON_OPTIONS` (market +
 * lucide, in display order) plus any market icon from `ICON_META` the
 * curated list does not carry. Every icon renders inline through
 * `DynamicIcon` (bundled lucide components, embedded market SVGs) — no
 * network — and each cell is memoised, so typing in the search box only
 * touches the cells that enter or leave the grid.
 *
 * Emits an iconId ("mkt:bond" or "lucide:settings") so callers can
 * persist a stable identifier, plus a self-contained SVG data URL for
 * callers that snapshot a coloured variant into a dock-config field.
 */

import { memo, useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DynamicIcon, lucideIconToSvg } from "@wellsfargo-starui/design-system/icons/react";
import { MARKET_ICON_SVGS, svgToDataUrl } from "@wellsfargo-starui/design-system/icons/all-icons";
import { ICON_META } from "@wellsfargo-starui/design-system/icons";
import { Input, ScrollArea, cn } from "@wellsfargo-starui/react";
import { ICON_OPTIONS } from "./dock-editor/icons";

// ─── Types ───────────────────────────────────────────────────────────

interface IconPickerProps {
  /**
   * Called with the iconId ("mkt:bond" or "lucide:settings") and a
   * self-contained SVG data URL in the requested colour. Persist the
   * iconId; the URL is convenience for dock configs that snapshot a
   * coloured variant.
   */
  onSelect: (iconId: string, svgDataUrl: string) => void;
  /** Currently selected iconId (e.g. "mkt:bond"). */
  selectedIcon?: string;
  /** Colour written into the emitted data URL (default: the text token). */
  color?: string;
}

interface IconEntry {
  id: string;
  name: string;
  source: "lucide" | "market";
}

// ─── The catalog ─────────────────────────────────────────────────────

function buildIconList(): IconEntry[] {
  const seen = new Set<string>();
  const icons: IconEntry[] = [];
  const push = (id: string, name: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    icons.push({ id, name, source: id.startsWith("mkt:") ? "market" : "lucide" });
  };
  // Curated order first — the market set, then the generic lucide glyphs.
  for (const opt of ICON_OPTIONS) push(opt.icon, opt.name);
  // Any market icon the curated list does not carry (system icons stay
  // out unless the curated list names them).
  for (const [key, meta] of Object.entries(ICON_META)) {
    if (meta.category === "system") continue;
    push(`mkt:${key}`, meta.name);
  }
  return icons;
}

const ALL_ICONS = buildIconList();

/** Self-contained data URL for an icon, in `color`. */
function iconDataUrl(icon: IconEntry, color: string): string {
  if (icon.source === "market") {
    const svg = MARKET_ICON_SVGS[icon.id.replace("mkt:", "")];
    return svg ? svgToDataUrl(svg, color) : "";
  }
  const svg = lucideIconToSvg(icon.id, { size: 24 });
  if (svg) return svgToDataUrl(svg, color);
  const [prefix, name] = icon.id.split(":");
  return `https://api.iconify.design/${prefix}/${name}.svg?color=${encodeURIComponent(color)}&height=24`;
}

// ─── Cells ───────────────────────────────────────────────────────────

const IconCell = memo(function IconCell({
  icon,
  selected,
  onPick,
}: {
  icon: IconEntry;
  selected: boolean;
  onPick: (icon: IconEntry) => void;
}) {
  return (
    <button
      type="button"
      title={icon.name}
      aria-pressed={selected}
      onClick={() => onPick(icon)}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-[var(--ds-radius-sm,2px)] border transition-colors",
        "text-[var(--ds-text-secondary)] hover:text-foreground hover:bg-[var(--ds-surface-tertiary)] hover:border-[var(--ds-border-secondary)]",
        selected
          ? "border-primary bg-[var(--ds-primary-soft)] text-foreground"
          : "border-transparent",
      )}
    >
      <DynamicIcon icon={icon.id} style={{ width: 16, height: 16 }} />
    </button>
  );
});

// ─── Component ──────────────────────────────────────────────────────

export function IconPicker({ onSelect, selectedIcon, color = "var(--ds-text-primary)" }: IconPickerProps) {
  const [search, setSearch] = useState("");
  // Filtering 200-odd cells is cheap; deferring keeps the input itself
  // responsive when a keystroke lands mid-render.
  const deferredSearch = useDeferredValue(search);

  const filteredIcons = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return ALL_ICONS;
    return ALL_ICONS.filter((icon) => icon.name.toLowerCase().includes(query) || icon.id.includes(query));
  }, [deferredSearch]);

  const handlePick = useMemo(
    () => (icon: IconEntry) => onSelect(icon.id, iconDataUrl(icon, color)),
    [onSelect, color],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons…"
          autoFocus
          className="h-8 pl-7 text-xs"
        />
      </div>

      <ScrollArea className="h-56">
        <div className="grid grid-cols-8 gap-1 p-1">
          {filteredIcons.length === 0 && (
            <div className="col-span-8 py-6 text-center text-xs text-muted-foreground">
              No icons found
            </div>
          )}
          {filteredIcons.map((icon) => (
            <IconCell key={icon.id} icon={icon} selected={selectedIcon === icon.id} onPick={handlePick} />
          ))}
        </div>
      </ScrollArea>

      <div className="flex items-center justify-between px-1 text-[10px] text-muted-foreground">
        <span>{filteredIcons.length === ALL_ICONS.length ? `${ALL_ICONS.length} icons` : `${filteredIcons.length} of ${ALL_ICONS.length} icons`}</span>
        {selectedIcon && <span className="truncate font-mono">{selectedIcon}</span>}
      </div>
    </div>
  );
}
