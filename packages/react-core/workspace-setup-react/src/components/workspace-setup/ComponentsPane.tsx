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
 *   - Per-row Configure / Clone / Delete actions
 *   - Click a row -> selection changes -> pane ③ inspector swaps
 *
 * Rendering: the pane and every row are memoised. A keystroke in the
 * inspector produces a new `entries` array, but only the edited entry is
 * a new object, so only its row re-renders. Icons render inline through
 * `DynamicIcon` — no per-row URL generation, no network.
 */

import { memo, useMemo, useState } from "react";
import { Plus, PlayCircle, Copy, Trash2, Search, Box } from "lucide-react";
import { DynamicIcon } from "@wellsfargo-starui/design-system/icons/react";
import { Button, Input } from "@wellsfargo-starui/react";
import type { RegistryEntry } from "@wellsfargo-starui/openfin/config";
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

export const ComponentsPane = memo(function ComponentsPane({
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

  const selectedId = selection.kind === "component" ? selection.entryId : null;

  return (
    <section className="flex h-full min-h-0 flex-col border-r border-[var(--ds-border-primary)]" aria-label="Components">
      <PaneHeader
        title="Components"
        subtitle="Shared catalog · all users"
        count={entries.length}
        action={
          <Button type="button" variant="outline" size="sm" onClick={onAddDraft} className="h-7 gap-1 px-2 text-xs">
            <Plus className="h-3.5 w-3.5" aria-hidden /> New
          </Button>
        }
      />

      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--ds-border-primary)] px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <FilterChip current={filter} value="all" label={`All (${counts.all})`} onChange={setFilter} />
          <FilterChip current={filter} value="in-dock" label={`In dock (${counts.inDock})`} onChange={setFilter} />
          <FilterChip current={filter} value="not-in-dock" label={`Not in dock (${counts.notInDock})`} onChange={setFilter} />
          <FilterChip current={filter} value="singleton" label={`Singleton (${counts.singleton})`} onChange={setFilter} />
        </div>
      </div>

      <div className="bn-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-xs leading-relaxed text-muted-foreground">
            {entries.length === 0
              ? 'No components yet. Click "+ New" to define your first one.'
              : "No components match the current filter."}
          </div>
        )}
        {filtered.map((entry) => (
          <ComponentRow
            key={entry.id}
            entry={entry}
            isSelected={entry.id === selectedId}
            isInDock={inDockEntryIds.has(entry.id)}
            onSelect={onSelect}
            onClone={onClone}
            onDelete={onDelete}
            onTest={onTest}
          />
        ))}
      </div>
    </section>
  );
});

// ─── Row ─────────────────────────────────────────────────────────────

const ComponentRow = memo(function ComponentRow({
  entry,
  isSelected,
  isInDock,
  onSelect,
  onClone,
  onDelete,
  onTest,
}: {
  entry: RegistryEntry;
  isSelected: boolean;
  isInDock: boolean;
  onSelect: (sel: EditorSelection) => void;
  onClone: (entryId: string) => void;
  onDelete: (entryId: string) => void;
  onTest: (entry: RegistryEntry) => void | Promise<void>;
}) {
  const select = () => onSelect({ kind: "component", entryId: entry.id });
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`component-row-${entry.id}`}
      data-selected={isSelected ? "true" : undefined}
      onClick={select}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } }}
      className="group relative flex w-full cursor-pointer items-start gap-2.5 border-b border-[var(--ds-border-primary)] px-3 py-2 text-left transition-colors hover:bg-[var(--ds-surface-secondary)] data-[selected=true]:bg-[var(--ds-primary-soft)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ds-primary-ring)]"
    >
      <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-r bg-transparent group-data-[selected=true]:bg-[var(--ds-primary)]" />
      <IconTile iconId={entry.iconId} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">{entry.displayName || "(unnamed)"}</span>
          {entry.singleton && <Pill title="Singleton — one instance, a second click focuses it">singleton</Pill>}
          {entry.type === "external" && <Pill title="External — served from outside this app">external</Pill>}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {entry.componentType || "—"} / {entry.componentSubType || "—"}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px]" style={{ color: isInDock ? "var(--ds-accent-positive)" : "var(--ds-text-muted)" }}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: isInDock ? "var(--ds-accent-positive)" : "var(--ds-border-secondary)" }} />
          {isInDock ? "In dock" : "Not in dock"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <RowAction title="Configure component" onClick={(e) => { e.stopPropagation(); void onTest(entry); }}>
          <PlayCircle className="h-3.5 w-3.5" aria-hidden />
        </RowAction>
        <RowAction title="Clone component" onClick={(e) => { e.stopPropagation(); onClone(entry.id); }}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
        </RowAction>
        <RowAction
          title="Delete"
          destructive
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete "${entry.displayName}"?`)) onDelete(entry.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </RowAction>
      </div>
    </div>
  );
});

// Visual preview of the registry entry's iconId, rendered inline. Falls
// back to a generic Box glyph when no icon is set yet.
function IconTile({ iconId }: { iconId: string | undefined }) {
  return (
    <span
      role={iconId ? "img" : undefined}
      aria-label={iconId || undefined}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ds-radius-sm,2px)] border border-[var(--ds-border-primary)] bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)]"
    >
      {iconId
        ? <DynamicIcon icon={iconId} style={{ width: 16, height: 16 }} />
        : <Box className="h-4 w-4 text-muted-foreground" aria-hidden />}
    </span>
  );
}

// ─── Shared chrome (also used by the dock and inspector panes) ────────

export function PaneHeader({
  title,
  subtitle,
  count,
  action,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[var(--ds-border-primary)] bg-[var(--ds-surface-primary)] px-3">
      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ds-text-secondary)]">{title}</span>
          {count !== undefined && (
            <span className="font-mono text-[10px] tabular-nums text-[var(--ds-text-faint)]">{count}</span>
          )}
        </div>
        {subtitle && <span className="truncate text-[10px] text-muted-foreground">{subtitle}</span>}
      </div>
      {action}
    </div>
  );
}

export function Pill({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="shrink-0 rounded-[var(--ds-radius-sm,2px)] border border-[var(--ds-border-primary)] bg-[var(--ds-surface-secondary)] px-1 text-[9px] font-medium uppercase tracking-[0.04em] text-[var(--ds-text-secondary)]"
    >
      {children}
    </span>
  );
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
      aria-pressed={active}
      onClick={() => onChange(value)}
      className="rounded-[var(--ds-radius-sm,2px)] border px-2 py-0.5 text-[10px] font-medium transition-colors"
      style={{
        background: active ? "var(--ds-primary)" : "var(--ds-surface-secondary)",
        color: active ? "var(--ds-primary-foreground)" : "var(--ds-text-secondary)",
        borderColor: active ? "var(--ds-primary)" : "var(--ds-border-primary)",
      }}
    >
      {label}
    </button>
  );
}

export function RowAction({
  title,
  onClick,
  disabled,
  destructive,
  children,
}: {
  title: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-6 w-6 items-center justify-center rounded-[var(--ds-radius-sm,2px)] text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-tertiary)] disabled:cursor-not-allowed disabled:opacity-30 ${destructive ? "hover:text-[var(--ds-accent-negative)]" : "hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
