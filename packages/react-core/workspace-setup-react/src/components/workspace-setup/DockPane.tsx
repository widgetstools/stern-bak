"use client";

/**
 * Pane ② of the WorkspaceSetup editor — the dock layout tree.
 *
 * Renders the user's per-user dock as a hierarchy:
 *   - Top-level ActionButtons launch a single component
 *   - Top-level DropdownButtons act as folders containing menu items
 *     (which can themselves nest into sub-menus)
 *
 * Authoring affordances:
 *   - Header has a "+ New menu" button that creates an empty
 *     DropdownButton — the user fills it via the per-row "+ Add"
 *     popover.
 *   - Per-row "+ Add" on dropdown rows opens a popover listing all
 *     registered components — selecting one adds it as a child menu
 *     item.
 *   - "X" buttons remove top-level buttons or nested menu items.
 *   - Up/down chevrons reorder top-level buttons (nested reordering
 *     lands in a follow-up).
 */

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, X, FolderPlus, Plus, Search, Folder, Box } from "lucide-react";
import type {
  DockEditorConfig,
  DockButtonConfig,
  DockDropdownButtonConfig,
  DockMenuItemConfig,
  RegistryEntry,
} from "@wellsfargo-starui/openfin-platform/config";
import { ACTION_LAUNCH_COMPONENT } from "@wellsfargo-starui/openfin-platform/config";
import { Input, Popover, PopoverContent, PopoverTrigger } from "@wellsfargo-starui/ui";
import { iconIdToSvgUrl } from "../dock-editor/iconUtils";
import type { EditorSelection } from "./types";

// ─── Inline icon preview ─────────────────────────────────────────────
// Renders the iconId the user picked next to each dock row so the
// editor visualises the actual selection. Falls back to a generic
// folder/box glyph when no iconId is set yet — useful for empty
// dropdowns or freshly-created action buttons before the user has
// chosen an icon.

function RowIcon({ iconId, isFolder }: { iconId: string | undefined; isFolder: boolean }) {
  const url = iconId ? iconIdToSvgUrl(iconId, "currentColor") : "";
  const size = 16;
  if (url) {
    return <img src={url} alt="" width={size} height={size} className="w-4 h-4 shrink-0 inline-flex items-center justify-center text-[var(--ds-text-secondary)]" />;
  }
  return isFolder ? (
    <Folder className="w-4 h-4 shrink-0 text-[var(--ds-text-secondary)]" />
  ) : (
    <Box className="w-4 h-4 shrink-0 text-[var(--ds-text-secondary)]" />
  );
}

interface DockPaneProps {
  dock: DockEditorConfig | null;
  entries: RegistryEntry[];
  selection: EditorSelection;
  onSelect: (sel: EditorSelection) => void;
  /** Remove a top-level dock button by its id. */
  onRemove: (buttonId: string) => void;
  /** Reorder the top-level dock buttons. fromIndex / toIndex are
   *  positions in the buttons[] array. Out-of-range moves are no-ops. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Append an empty DropdownButton to the dock. */
  onCreateDropdown: () => void;
  /**
   * Add a registered component as a child menu item of an existing
   * DropdownButton. parentButtonId is the dropdown's id.
   */
  onAddComponentToDropdown: (parentButtonId: string, entry: RegistryEntry) => void;
  /**
   * Remove a child menu item. buttonId is the owning top-level
   * DropdownButton; itemId is the leaf to remove; parentItemId is the
   * direct parent menu item if the leaf lives in a nested sub-menu.
   */
  onRemoveMenuItem: (buttonId: string, itemId: string, parentItemId?: string) => void;
}

export function DockPane({
  dock,
  entries,
  selection,
  onSelect,
  onRemove,
  onReorder,
  onCreateDropdown,
  onAddComponentToDropdown,
  onRemoveMenuItem,
}: DockPaneProps) {
  const entriesById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const buttons = dock?.buttons ?? [];

  return (
    <div className="flex flex-col h-full border-r min-h-0 border-[var(--ds-border-primary)]">
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0 border-[var(--ds-border-primary)]"
      >
        <div className="flex flex-col">
          <span className="text-xs font-semibold tracking-wide text-[var(--ds-text-secondary)]">
            ② DOCK LAYOUT  →
          </span>
          <span className="text-[10px] text-muted-foreground">
            personal · per user
          </span>
        </div>
        <button
          type="button"
          onClick={onCreateDropdown}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-[var(--ds-surface-secondary)] text-foreground border border-[var(--ds-border-primary)]"
          title="Create a new dropdown menu — you'll add components to it via the per-row + Add affordance"
        >
          <FolderPlus className="w-3 h-3" /> New menu
        </button>
      </div>

      <div className="flex-1 overflow-auto bn-scrollbar p-3 min-h-0">
        {buttons.length === 0 && (
          <div
            className="rounded-md border border-dashed p-4 text-center text-xs border-[var(--ds-border-primary)] text-muted-foreground"
          >
            Your dock has no buttons yet. Pick a component on the left and
            click <strong>Add to your dock</strong>, or click <strong>+ New menu</strong>{" "}
            to create a dropdown to group components into.
          </div>
        )}
        {buttons.map((btn, idx) => (
          <DockButtonRow
            key={btn.id}
            button={btn}
            entries={entries}
            entriesById={entriesById}
            selection={selection}
            onSelect={onSelect}
            onRemove={() => onRemove(btn.id)}
            onMoveUp={idx > 0 ? () => onReorder(idx, idx - 1) : undefined}
            onMoveDown={idx < buttons.length - 1 ? () => onReorder(idx, idx + 1) : undefined}
            onAddComponentToDropdown={onAddComponentToDropdown}
            onRemoveMenuItem={onRemoveMenuItem}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Top-level row ───────────────────────────────────────────────────

function DockButtonRow({
  button,
  entries,
  entriesById,
  selection,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAddComponentToDropdown,
  onRemoveMenuItem,
}: {
  button: DockButtonConfig;
  entries: RegistryEntry[];
  entriesById: Map<string, RegistryEntry>;
  selection: EditorSelection;
  onSelect: (sel: EditorSelection) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onAddComponentToDropdown: (parentButtonId: string, entry: RegistryEntry) => void;
  onRemoveMenuItem: (buttonId: string, itemId: string, parentItemId?: string) => void;
}) {
  const isDropdown = button.type === "DropdownButton";
  const dropdown = isDropdown ? (button as DockDropdownButtonConfig) : null;
  const isSelected = selection.kind === "dock-item" && selection.itemId === button.id;

  const isLaunchComponent = (button as { actionId?: string }).actionId === ACTION_LAUNCH_COMPONENT;
  const refId = isLaunchComponent
    ? ((button as { customData?: unknown }).customData as { registryEntryId?: string } | undefined)?.registryEntryId
    : undefined;
  const broken = isLaunchComponent && refId && !entriesById.has(refId);

  return (
    <div className="mb-2 group">
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => onSelect({ kind: "dock-item", itemId: button.id })}
          className="flex-1 text-left rounded-md px-2 py-1.5 text-xs flex items-center gap-2 border border-[var(--ds-border-primary)]"
          style={{
            background: isSelected ? "var(--ds-surface-tertiary)" : "var(--ds-surface-secondary)",
            color: broken ? "var(--ds-accent-warning)" : "var(--ds-text-primary)",
            textDecoration: broken ? "line-through" : "none",
          }}
        >
          <RowIcon iconId={button.iconId} isFolder={isDropdown} />
          <span className="font-medium flex-1 truncate">
            {isDropdown && <span className="text-muted-foreground">▾ </span>}
            {button.tooltip}
          </span>
          {broken && (
            <span className="text-[10px] text-[var(--ds-accent-warning)]">
              ⚠ Component deleted
            </span>
          )}
        </button>
        {isDropdown && (
          <AddChildPopover
            parentLabel={button.tooltip}
            entries={entries}
            onPick={(entry) => onAddComponentToDropdown(button.id, entry)}
          />
        )}
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <RowAction title="Move up" onClick={onMoveUp} disabled={!onMoveUp}>
            <ChevronUp className="w-3 h-3" />
          </RowAction>
          <RowAction title="Move down" onClick={onMoveDown} disabled={!onMoveDown}>
            <ChevronDown className="w-3 h-3" />
          </RowAction>
        </div>
        <RowAction
          title="Remove from dock"
          onClick={() => {
            if (confirm(`Remove "${button.tooltip}" from your dock?`)) onRemove();
          }}
        >
          <X className="w-3 h-3" />
        </RowAction>
      </div>
      {dropdown && dropdown.options.length > 0 && (
        <div className="ml-4 mt-1 border-l pl-2 border-[var(--ds-border-primary)]">
          {dropdown.options.map((it) => (
            <DockMenuItemRow
              key={it.id}
              item={it}
              parentButtonId={button.id}
              parentItemId={undefined}
              entriesById={entriesById}
              selection={selection}
              onSelect={onSelect}
              onRemoveMenuItem={onRemoveMenuItem}
            />
          ))}
        </div>
      )}
      {dropdown && dropdown.options.length === 0 && (
        <div
          className="ml-4 mt-1 px-2 py-1 text-[10px] italic text-muted-foreground"
        >
          Empty menu — click <strong>+ Add</strong> to drop a component in.
        </div>
      )}
    </div>
  );
}

// ─── Nested menu item ────────────────────────────────────────────────

function DockMenuItemRow({
  item,
  parentButtonId,
  parentItemId,
  entriesById,
  selection,
  onSelect,
  onRemoveMenuItem,
}: {
  item: DockMenuItemConfig;
  parentButtonId: string;
  parentItemId?: string;
  entriesById: Map<string, RegistryEntry>;
  selection: EditorSelection;
  onSelect: (sel: EditorSelection) => void;
  onRemoveMenuItem: (buttonId: string, itemId: string, parentItemId?: string) => void;
}) {
  const isLaunchComponent = item.actionId === ACTION_LAUNCH_COMPONENT;
  const refId = isLaunchComponent
    ? (item.customData as { registryEntryId?: string })?.registryEntryId
    : undefined;
  const broken = isLaunchComponent && refId && !entriesById.has(refId);
  const isSelected = selection.kind === "dock-item" && selection.itemId === item.id;

  const isFolder = (item.options?.length ?? 0) > 0;
  return (
    <div className="group">
      <div className="flex items-stretch gap-1 my-1">
        <button
          type="button"
          onClick={() => onSelect({ kind: "dock-item", itemId: item.id })}
          className="flex-1 text-left rounded-md px-2 py-1 text-xs flex items-center gap-2"
          style={{
            background: isSelected ? "var(--ds-surface-tertiary)" : "transparent",
            color: broken ? "var(--ds-accent-warning, var(--ds-accent-warning))" : "var(--ds-text-secondary)",
            textDecoration: broken ? "line-through" : "none",
          }}
        >
          <RowIcon iconId={item.iconId} isFolder={isFolder} />
          <span className="flex-1 truncate">{item.tooltip}</span>
          {broken && (
            <span className="text-[10px] text-[var(--ds-accent-warning)]">
              ⚠ Component deleted
            </span>
          )}
        </button>
        <RowAction
          title="Remove from menu"
          onClick={() => {
            if (confirm(`Remove "${item.tooltip}" from this menu?`)) {
              onRemoveMenuItem(parentButtonId, item.id, parentItemId);
            }
          }}
        >
          <X className="w-3 h-3" />
        </RowAction>
      </div>
      {item.options && item.options.length > 0 && (
        <div className="ml-3 border-l pl-2 border-[var(--ds-border-primary)]">
          {item.options.map((sub) => (
            <DockMenuItemRow
              key={sub.id}
              item={sub}
              parentButtonId={parentButtonId}
              parentItemId={item.id}
              entriesById={entriesById}
              selection={selection}
              onSelect={onSelect}
              onRemoveMenuItem={onRemoveMenuItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add-child popover ───────────────────────────────────────────────
// Lists every registered component with a quick search. Picking one
// fires onPick — the parent calls onAddComponentToDropdown for the
// owning dropdown id and closes the popover.

function AddChildPopover({
  parentLabel,
  entries,
  onPick,
}: {
  parentLabel: string;
  entries: RegistryEntry[];
  onPick: (entry: RegistryEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      `${e.displayName} ${e.componentType} ${e.componentSubType}`.toLowerCase().includes(q),
    );
  }, [entries, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Add a component to "${parentLabel}"`}
          className="rounded-md px-2 text-xs bg-[var(--ds-surface-secondary)] border border-[var(--ds-border-primary)] text-[var(--ds-text-secondary)]"
        >
          <Plus className="w-3 h-3 inline -mt-0.5" /> Add
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-2 w-[280px] bg-background border-[var(--ds-border-primary)] text-foreground"
        align="end"
      >
        <div
          className="flex items-center gap-2 rounded-md px-2 py-1 mb-2 bg-[var(--ds-surface-secondary)] border border-[var(--ds-border-primary)]"
        >
          <Search className="w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components"
            className="h-auto flex-1 rounded-none border-0 px-0 py-0 text-xs shadow-none bg-transparent text-foreground focus-visible:ring-0"
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-auto bn-scrollbar">
          {filtered.length === 0 && (
            <div className="text-center text-xs py-3 text-muted-foreground">
              {entries.length === 0 ? "Define a component first." : "No matches."}
            </div>
          )}
          {filtered.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                onPick(entry);
                setOpen(false);
              }}
              className="w-full text-left rounded-md px-2 py-1 text-xs my-0.5 text-[var(--ds-text-secondary)]"
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ds-surface-secondary)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div className="font-medium text-foreground">
                {entry.displayName || "(unnamed)"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {entry.componentType || "—"} / {entry.componentSubType || "—"}
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Row action button (shared) ──────────────────────────────────────

function RowAction({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-[var(--ds-text-secondary)]"
    >
      {children}
    </button>
  );
}
