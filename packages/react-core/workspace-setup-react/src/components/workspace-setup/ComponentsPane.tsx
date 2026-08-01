"use client";

/**
 * Pane ① of the WorkspaceSetup editor — the Components catalog.
 *
 * Reads the registry via the shared useRegistryEditor hook (so any
 * other window subscribed to IAB_REGISTRY_CONFIG_UPDATE sees the
 * same entries). Surfaces:
 *
 *   - Search box + filter chips (all / in-dock / not-in-dock / singleton)
 *   - "+ New" button to draft an empty entry — appears at the top of
 *     the list immediately so the user can edit it in pane ③ before
 *     committing
 *   - Per-row Test Launch button (delegates to the same testComponent
 *     used by the standalone registry editor)
 *   - Per-row Delete button
 *   - Click a row -> selection changes -> pane ③ inspector swaps
 */

import { useMemo, useState } from "react";
import { Plus, PlayCircle, Copy, Trash2, Search, Box } from "lucide-react";
import { Input } from "@wellsfargo-starui/ui";
import type { RegistryEntry } from "@wellsfargo-starui/openfin/config";
import { iconIdToSvgUrl } from "../dock-editor/iconUtils";
import type { EditorSelection, ComponentFilter } from "./types";

interface ComponentsPaneProps {
  entries: RegistryEntry[];
  /** Set of registry-entry ids referenced by the current dock layout. */
  inDockEntryIds: Set<string>;
  selection: EditorSelection;
  onSelect: (sel: EditorSelection) => void;
  onAddDraft: () => void;
  onClone: (entryId: string) => void;
  onDelete: (entryId: string) => void;
  onTest: (entry: RegistryEntry) => void | Promise<void>;
}

export function ComponentsPane({
  entries,
  inDockEntryIds,
  selection,
  onSelect,
  onAddDraft,
  onClone,
  onDelete,
  onTest,
}: ComponentsPaneProps) {
  const [filter, setFilter] = useState<ComponentFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === "in-dock" && !inDockEntryIds.has(e.id)) return false;
      if (filter === "not-in-dock" && inDockEntryIds.has(e.id)) return false;
      if (filter === "singleton" && !e.singleton) return false;
      if (term) {
        const hay = `${e.displayName} ${e.componentType} ${e.componentSubType}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [entries, filter, search, inDockEntryIds]);

  const counts = useMemo(() => ({
    all: entries.length,
    inDock: entries.filter((e) => inDockEntryIds.has(e.id)).length,
    notInDock: entries.filter((e) => !inDockEntryIds.has(e.id)).length,
    singleton: entries.filter((e) => e.singleton).length,
  }), [entries, inDockEntryIds]);

  return (
    <div className="flex flex-col h-full border-r border-[var(--ds-border-primary)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--ds-border-primary)]">
        <div className="flex flex-col">
          <span className="text-xs font-semibold tracking-wide text-[var(--ds-text-secondary)]">
            ① COMPONENTS
          </span>
          <span className="text-[10px] text-muted-foreground">
            global · all users
          </span>
        </div>
        <button
          type="button"
          onClick={onAddDraft}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-[var(--ds-surface-secondary)] text-foreground border border-[var(--ds-border-primary)]"
        >
          <Plus className="w-3 h-3" /> New
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[var(--ds-border-primary)]">
        <div
          className="flex items-center gap-2 rounded-md px-2 py-1 bg-[var(--ds-surface-secondary)] border border-[var(--ds-border-primary)]"
        >
          <Search className="w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components"
            className="h-auto flex-1 rounded-none border-0 px-0 py-0 text-xs shadow-none bg-transparent text-foreground focus-visible:ring-0"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-[var(--ds-border-primary)]">
        <FilterChip current={filter} value="all" label={`All (${counts.all})`} onChange={setFilter} />
        <FilterChip current={filter} value="in-dock" label={`In dock (${counts.inDock})`} onChange={setFilter} />
        <FilterChip current={filter} value="not-in-dock" label={`Not in dock (${counts.notInDock})`} onChange={setFilter} />
        <FilterChip current={filter} value="singleton" label={`Singleton (${counts.singleton})`} onChange={setFilter} />
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto bn-scrollbar min-h-0">
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {entries.length === 0
              ? 'No components yet. Click "+ New" to define your first one.'
              : "No components match the current filter."}
          </div>
        )}
        {filtered.map((entry) => {
          const isSelected = selection.kind === "component" && selection.entryId === entry.id;
          const isInDock = inDockEntryIds.has(entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect({ kind: "component", entryId: entry.id })}
              className="w-full text-left flex items-start gap-2 px-3 py-2 border-b group"
              style={{
                background: isSelected ? "var(--ds-surface-tertiary)" : "transparent",
                borderColor: "var(--ds-border-primary)",
                borderLeft: isSelected ? "2px solid var(--de-accent)" : "2px solid transparent",
              }}
            >
              <ComponentIcon iconId={entry.iconId} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium truncate text-foreground">
                  {entry.singleton && <span title="Singleton">⭐</span>}
                  {entry.type === "external" && <span title="External component">🌐</span>}
                  <span className="truncate">{entry.displayName || "(unnamed)"}</span>
                </div>
                <div className="text-[10px] mt-0.5 truncate text-muted-foreground">
                  {entry.componentType || "—"} / {entry.componentSubType || "—"}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: isInDock ? "var(--ds-accent-positive)" : "var(--ds-accent-warning)" }}>
                  {isInDock ? "✓ in dock" : "⚠ not in dock"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <RowAction
                  title="Configure component"
                  onClick={(e) => { e.stopPropagation(); void onTest(entry); }}
                >
                  <PlayCircle className="w-3 h-3" />
                </RowAction>
                <RowAction
                  title="Clone component"
                  onClick={(e) => { e.stopPropagation(); onClone(entry.id); }}
                >
                  <Copy className="w-3 h-3" />
                </RowAction>
                <RowAction
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${entry.displayName}"?`)) onDelete(entry.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </RowAction>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Visual preview of the registry entry's iconId. Falls back to a
// generic Box glyph when no icon is set yet.
function ComponentIcon({ iconId }: { iconId: string | undefined }) {
  const url = iconId ? iconIdToSvgUrl(iconId, "currentColor") : "";
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={20}
        height={20}
        className="w-5 h-5 shrink-0 text-[var(--ds-text-secondary)]"
      />
    );
  }
  return <Box className="w-5 h-5 shrink-0 text-muted-foreground" />;
}

function FilterChip({
  current,
  value,
  label,
  onChange,
}: {
  current: ComponentFilter;
  value: ComponentFilter;
  label: string;
  onChange: (v: ComponentFilter) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className="rounded-md px-2 py-0.5 text-[10px] font-medium border border-[var(--ds-border-primary)]"
      style={{
        background: active ? "var(--de-accent)" : "var(--ds-surface-secondary)",
        color: active ? "var(--de-accent-foreground)" : "var(--ds-text-secondary)",
      }}
    >
      {label}
    </button>
  );
}

function RowAction({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded p-1 hover:bg-white/10 text-[var(--ds-text-secondary)]"
    >
      {children}
    </button>
  );
}
