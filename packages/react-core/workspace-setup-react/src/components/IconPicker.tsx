"use client";

/**
 * IconPicker — searchable grid of icons for dock buttons and menu items.
 *
 * Emits an iconId ("mkt:bond" or "lucide:settings") so callers persist a stable
 * identifier, plus the resolved SVG data URL for dock configs that snapshot a
 * coloured variant.
 *
 * ## Why this is built the way it is
 *
 * There are ~255 icons. The first version rendered all of them, and for each
 * market icon ran two regexes over its SVG string and re-parsed the result —
 * on every render, so every keystroke in the search box redid the lot. Two
 * things fix that, and both matter:
 *
 *  1. **Nothing is computed during render.** The searchable haystack is built
 *     once at module load, and resized SVG markup is cached by `IconGlyph`.
 *  2. **Only what's on screen is mounted.** The grid windows to the visible
 *     rows plus a small overscan, so scrolling and typing stay flat regardless
 *     of how many icons the catalogue grows to.
 */

import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { MARKET_ICON_SVGS, svgToDataUrl } from "@wellsfargo-starui/design-system/icons/all-icons";
import { ICON_META } from "@wellsfargo-starui/design-system/icons";
import { Input, cn } from "@wellsfargo-starui/react";
import { ICON_OPTIONS } from "./dock-editor/icons";
import { IconGlyph } from "./IconGlyph";

interface IconPickerProps {
  onSelect: (iconId: string, svgDataUrl: string) => void;
  selectedIcon?: string;
  /** Colour baked into the emitted data URL (not the on-screen rendering). */
  color?: string;
}

interface IconEntry {
  id: string;
  name: string;
  source: "lucide" | "market";
  /** Lowercased name + id, precomputed so filtering never lowercases per key. */
  haystack: string;
}

/**
 * The catalogue, de-duplicated and correctly attributed.
 *
 * This used to concatenate `ICON_META` (tagged `market`) with `ICON_OPTIONS`
 * (tagged `lucide` **wholesale**) — but 80 of `ICON_OPTIONS`' 140 entries carry
 * `mkt:*` ids, so 72 icons appeared in both passes. That is WORKLOG item 7a,
 * and it caused all three of the picker's visible faults:
 *
 *  - duplicate `key={icon.id}`, so React could not reconcile the filtered grid
 *    and a search left ~72 non-matching icons on screen;
 *  - the mis-tagged duplicate took the lucide branch on click and emitted
 *    `https://api.iconify.design/mkt/bond.svg`, which does not exist — persist
 *    that into a dock config and the button renders blank;
 *  - the `category === "system"` skip was defeated, because the same ids came
 *    back through the second pass.
 *
 * Both fixes are structural: `source` is derived from the id's own prefix
 * rather than from which list it arrived in, and a Map keyed by id makes a
 * second sighting a no-op instead of a duplicate.
 */
function buildIconList(): IconEntry[] {
  const byId = new Map<string, IconEntry>();
  const systemKeys = new Set(
    Object.entries(ICON_META)
      .filter(([, meta]) => meta.category === "system")
      .map(([key]) => `mkt:${key}`),
  );

  const add = (id: string, name: string) => {
    // System icons (wrench, code, …) aren't user-selectable — and this now
    // holds however many lists the id turns up in.
    if (systemKeys.has(id) || byId.has(id)) return;
    byId.set(id, {
      id,
      name,
      source: id.startsWith("mkt:") ? "market" : "lucide",
      haystack: `${name} ${id}`.toLowerCase(),
    });
  };

  for (const [key, meta] of Object.entries(ICON_META)) add(`mkt:${key}`, meta.name);
  for (const opt of ICON_OPTIONS) add(opt.icon, opt.name);

  return [...byId.values()];
}

const ALL_ICONS = buildIconList();

const COLUMNS = 8;
const CELL = 34;
const VIEWPORT = 220;
const OVERSCAN = 2;

export function IconPicker({ onSelect, selectedIcon, color = "var(--ds-text-primary)" }: IconPickerProps) {
  const [search, setSearch] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Keeps typing responsive: the input updates immediately, the (larger) grid
  // re-filters at React's leisure instead of blocking the keystroke.
  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return ALL_ICONS;
    return ALL_ICONS.filter((icon) => icon.haystack.includes(q));
  }, [deferredSearch]);

  const rowCount = Math.ceil(filtered.length / COLUMNS);
  const firstRow = Math.max(0, Math.floor(scrollTop / CELL) - OVERSCAN);
  const lastRow = Math.min(rowCount, Math.ceil((scrollTop + VIEWPORT) / CELL) + OVERSCAN);
  const visible = filtered.slice(firstRow * COLUMNS, lastRow * COLUMNS);

  const handleSelect = useCallback(
    (icon: IconEntry) => {
      if (icon.source === "market") {
        const svg = MARKET_ICON_SVGS[icon.id.slice(4)];
        if (svg) onSelect(icon.id, svgToDataUrl(svg, color));
        return;
      }
      const [prefix, name] = icon.id.split(":");
      if (!prefix || !name) return;
      onSelect(
        icon.id,
        `https://api.iconify.design/${prefix}/${name}.svg?color=${encodeURIComponent(color)}&height=24`,
      );
    },
    [onSelect, color],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            // A new result set is a new list; start it at the top.
            setScrollTop(0);
            // Guarded: jsdom's HTMLElement has no scrollTo.
            scrollerRef.current?.scrollTo?.({ top: 0 });
          }}
          placeholder="Search icons…"
          autoFocus
          className="pl-8 h-8 text-xs"
        />
      </div>

      <div className="flex items-baseline justify-between px-0.5">
        <span className="text-[10px] text-muted-foreground">
          {filtered.length} icon{filtered.length === 1 ? "" : "s"}
        </span>
        {selectedIcon && (
          <span className="text-[10px] font-mono text-muted-foreground/80 truncate max-w-[200px]" title={selectedIcon}>
            {selectedIcon}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground" style={{ height: VIEWPORT }}>
          <SearchX className="h-5 w-5" />
          <span className="text-xs">No icons match “{search.trim()}”</span>
        </div>
      ) : (
        <div
          ref={scrollerRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          className="overflow-auto bn-scrollbar rounded-md border border-[var(--ds-border-primary)] bg-[var(--ds-surface-secondary)]/40"
          style={{ height: VIEWPORT }}
        >
          {/* Full-height spacer keeps the scrollbar honest while only the
              visible window is mounted. */}
          <div style={{ height: rowCount * CELL, position: "relative" }}>
            <div
              className="grid gap-1 p-1"
              style={{
                gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
                position: "absolute",
                top: firstRow * CELL,
                left: 0,
                right: 0,
              }}
            >
              {visible.map((icon) => {
                const isSelected = selectedIcon === icon.id;
                return (
                  <button
                    key={icon.id}
                    type="button"
                    title={`${icon.name} · ${icon.id}`}
                    aria-label={icon.name}
                    aria-pressed={isSelected}
                    onClick={() => handleSelect(icon)}
                    className={cn(
                      "h-8 w-full flex items-center justify-center rounded-md border transition-colors",
                      "border-transparent text-[var(--ds-text-secondary)]",
                      "hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text-primary)]",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ds-state-focus-ring)]",
                      isSelected &&
                        "bg-[var(--ds-surface-selected)] border-[var(--ds-border-focus)] text-[var(--ds-text-primary)]",
                    )}
                  >
                    <IconGlyph iconId={icon.id} size={16} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
