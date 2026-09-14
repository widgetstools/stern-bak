"use client";

/**
 * Pane ③ of the WorkspaceSetup editor — context-sensitive Inspector.
 *
 * Three modes:
 *   - selection.kind === 'none'      → workspace overview card
 *   - selection.kind === 'component' → full edit form for the entry,
 *     plus Configure Component and the "In your dock at" reverse links
 *   - selection.kind === 'dock-item' → per-placement label / icon overrides
 *
 * Form persistence: every field change dispatches an UPDATE_ENTRY action
 * via the parent — the entry in the registry hook's reducer is the
 * single source of truth. The shell's Save button is what flushes to
 * ConfigService; until then changes accumulate as dirty state.
 */

import { memo, useMemo, useState } from "react";
import { PlayCircle, AlertCircle, ArrowRight, ExternalLink, ImageIcon, Check } from "lucide-react";
import { DynamicIcon } from "@wellsfargo-starui/design-system/icons/react";
import type {
  RegistryEntry,
  DockButtonConfig,
  DockDropdownButtonConfig,
  DockMenuItemConfig,
} from "@wellsfargo-starui/openfin/config";
import {
  deriveTemplateConfigId,
  ACTION_LAUNCH_COMPONENT,
} from "@wellsfargo-starui/openfin/config";
import { Button, Checkbox, Input, Popover, PopoverContent, PopoverTrigger } from "@wellsfargo-starui/react";
import type { EditorSelection } from "./types";
import { IconPicker } from "../IconPicker";
import { PaneHeader } from "./ComponentsPane";

/**
 * Where in the dock a component is referenced. One DockPlacement per
 * appearance — a single component can show up in multiple places.
 *
 * `path` is a human-readable trail like "Reports → Risk Dashboard"
 * rendered in the "In your dock at" footer.
 */
export interface DockPlacement {
  buttonId: string;
  path: string;
}

interface InspectorPaneProps {
  selection: EditorSelection;
  entries: RegistryEntry[];
  buttons: DockButtonConfig[];
  onChange: (id: string, patch: Partial<RegistryEntry>) => void;
  /**
   * Update label / icon / iconColor on a top-level dock button. The
   * dock-item inspector treats these as per-placement overrides
   * independent of the referenced component's defaults.
   */
  onEditButton: (buttonId: string, patch: Partial<DockButtonConfig>) => void;
  /**
   * Update a nested menu item inside a dropdown. `topButtonId` is the
   * top-level DropdownButton that owns the chain; `parentItemId` is
   * the direct parent menu item if the leaf lives in a sub-menu.
   */
  onEditMenuItem: (
    topButtonId: string,
    itemId: string,
    parentItemId: string | undefined,
    patch: Partial<DockMenuItemConfig>,
  ) => void;
  onTest: (entry: RegistryEntry) => void | Promise<void>;
  /** Add the selected component to the user's dock as a top-level button. */
  onAddToDock: (entry: RegistryEntry) => void;
  /** Move selection to a dock item (used by reverse-link "jump to placement"). */
  onSelect: (sel: EditorSelection) => void;
  inDockEntryIds: Set<string>;
  /** Counts for the "nothing selected" overview card. */
  summary: {
    totalComponents: number;
    inDock: number;
    singletons: number;
    dockButtons: number;
  };
}

export const InspectorPane = memo(function InspectorPane({
  selection,
  entries,
  buttons,
  onChange,
  onEditButton,
  onEditMenuItem,
  onTest,
  onAddToDock,
  onSelect,
  inDockEntryIds,
  summary,
}: InspectorPaneProps) {
  // Derive the dock placement index — for each registry entry, where
  // does it appear in the dock? Used by both the "In your dock at"
  // footer (component selected) and the dock-item ↔ component pivot
  // (dock item selected → which component does it reference?).
  const placementsByEntry = useMemo(() => collectPlacements(buttons), [buttons]);

  if (selection.kind === "none") {
    return <SummaryCard summary={summary} />;
  }

  if (selection.kind === "dock-item") {
    return (
      <DockItemInspector
        itemId={selection.itemId}
        buttons={buttons}
        entries={entries}
        onEditButton={onEditButton}
        onEditMenuItem={onEditMenuItem}
        onSelect={onSelect}
      />
    );
  }

  const entry = entries.find((e) => e.id === selection.entryId);
  if (!entry) {
    return (
      <PaneShell title="Component">
        <Notice>Selected component no longer exists. It may have been deleted.</Notice>
      </PaneShell>
    );
  }

  return <ComponentForm
    entry={entry}
    entries={entries}
    onChange={(patch) => onChange(entry.id, patch)}
    onTest={onTest}
    onAddToDock={onAddToDock}
    onSelect={onSelect}
    isInDock={inDockEntryIds.has(entry.id)}
    placements={placementsByEntry.get(entry.id) ?? []}
  />;
});

// ─── Dock placement collector ────────────────────────────────────────

function collectPlacements(buttons: DockButtonConfig[]): Map<string, DockPlacement[]> {
  const result = new Map<string, DockPlacement[]>();
  for (const btn of buttons) {
    visitButton(btn, btn.tooltip, result);
  }
  return result;
}

function visitButton(btn: DockButtonConfig, prefix: string, acc: Map<string, DockPlacement[]>): void {
  // ActionButton itself can launch a component
  if ((btn as { actionId?: string }).actionId === ACTION_LAUNCH_COMPONENT) {
    const refId = ((btn as { customData?: unknown }).customData as { registryEntryId?: string } | undefined)?.registryEntryId;
    if (refId) {
      const existing = acc.get(refId) ?? [];
      existing.push({ buttonId: btn.id, path: prefix });
      acc.set(refId, existing);
    }
  }
  if (btn.type === "DropdownButton") {
    const dropdown = btn as DockDropdownButtonConfig;
    for (const opt of (dropdown.options ?? [])) {
      visitMenuItem(opt, btn.id, `${prefix} → ${opt.tooltip}`, acc);
    }
  }
}

function visitMenuItem(
  item: { id: string; tooltip: string; actionId?: string; customData?: unknown; options?: unknown[] },
  topButtonId: string,
  pathSoFar: string,
  acc: Map<string, DockPlacement[]>,
): void {
  if (item.actionId === ACTION_LAUNCH_COMPONENT) {
    const refId = (item.customData as { registryEntryId?: string } | undefined)?.registryEntryId;
    if (refId) {
      const existing = acc.get(refId) ?? [];
      existing.push({ buttonId: topButtonId, path: pathSoFar });
      acc.set(refId, existing);
    }
  }
  for (const sub of ((item.options ?? []) as Array<typeof item>)) {
    visitMenuItem(sub, topButtonId, `${pathSoFar} → ${sub.tooltip}`, acc);
  }
}

// ─── Overview card (shown when nothing selected) ─────────────────────

function SummaryCard({ summary }: { summary: InspectorPaneProps["summary"] }) {
  return (
    <PaneShell title="Overview">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Components" value={summary.totalComponents} />
        <Stat label="In your dock" value={summary.inDock} />
        <Stat label="Singletons" value={summary.singletons} />
        <Stat label="Dock buttons" value={summary.dockButtons} />
      </div>
      <div className="mt-3 rounded-[var(--ds-radius-md,2px)] border border-[var(--ds-border-primary)] bg-[var(--ds-surface-secondary)] p-3 text-[11px] leading-relaxed text-muted-foreground">
        Select a component on the left to edit it, or click <strong className="text-[var(--ds-text-secondary)]">+ New</strong> to define a new one.
        Pick a dock item in the middle to change its label or icon.
      </div>
    </PaneShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--ds-radius-md,2px)] border border-[var(--ds-border-primary)] bg-[var(--ds-surface-secondary)] p-2.5">
      <div className="font-mono text-lg font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
    </div>
  );
}

// ─── Component edit form ─────────────────────────────────────────────

function ComponentForm({
  entry,
  entries,
  onChange,
  onTest,
  onAddToDock,
  onSelect,
  isInDock,
  placements,
}: {
  entry: RegistryEntry;
  entries: RegistryEntry[];
  onChange: (patch: Partial<RegistryEntry>) => void;
  onTest: (entry: RegistryEntry) => void | Promise<void>;
  onAddToDock: (entry: RegistryEntry) => void;
  onSelect: (sel: EditorSelection) => void;
  isInDock: boolean;
  placements: DockPlacement[];
}) {
  // Uniqueness check: another entry with the same (componentType, subType)?
  const dupKey = useMemo(() => {
    if (!entry.componentType) return null;
    const others = entries.filter((e) => e.id !== entry.id);
    const clash = others.find(
      (e) =>
        e.componentType === entry.componentType &&
        e.componentSubType === entry.componentSubType,
    );
    return clash ? clash.displayName : null;
  }, [entry.id, entry.componentType, entry.componentSubType, entries]);

  // Singleton-toggle is a pure flag flip — `id` and `configId` are both
  // bound to `${componentType}-${componentSubType}` whether singleton is
  // on or off, so toggling never changes the id.
  const handleSingletonToggle = (next: boolean) => {
    onChange({ singleton: next });
  };

  // Type / subtype edits are pure field writes — we deliberately do
  // NOT re-derive `id` on every keystroke, because the parent tracks
  // the inspector selection by `entryId`. Rewriting `entry.id` from
  // a half-typed type ("b" while the user is typing "blotter") would
  // immediately invalidate the selection, unmount the input, and
  // make typing impossible. The canonical id derivation lives at SAVE
  // time; the "Config ID" preview below shows the live derivation.
  const handleTypeChange = (field: "componentType" | "componentSubType", value: string) => {
    onChange({ [field]: value } as Partial<RegistryEntry>);
  };

  return (
    <PaneShell title="Component">
      <div className="flex flex-col gap-4">
        {/* Icon + Name row — icon picker is the visual anchor */}
        <div className="flex items-end gap-2">
          <IconField
            iconId={entry.iconId}
            onChange={(iconId) => onChange({ iconId })}
          />
          <div className="flex-1">
            <Field label="Name">
              <Input
                value={entry.displayName}
                onChange={(e) => onChange({ displayName: e.target.value })}
                placeholder="e.g. Risk Dashboard"
                className="h-8 text-xs"
              />
            </Field>
          </div>
        </div>

        {/* Type / SubType */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <Input
              value={entry.componentType}
              onChange={(e) => handleTypeChange("componentType", e.target.value)}
              placeholder="blotter"
              className="h-8 font-mono text-xs"
            />
          </Field>
          <Field label="SubType">
            <Input
              value={entry.componentSubType}
              onChange={(e) => handleTypeChange("componentSubType", e.target.value)}
              placeholder="positions"
              className="h-8 font-mono text-xs"
            />
          </Field>
        </div>

        {dupKey && (
          <Notice tone="warning">
            Another component <strong>"{dupKey}"</strong> uses this same Type/SubType pair. Singletons require a unique pair within an app.
          </Notice>
        )}

        {/* Host URL */}
        <Field label="Host URL">
          <Input
            value={entry.hostUrl}
            onChange={(e) => onChange({ hostUrl: e.target.value })}
            placeholder="/blotters/marketsgrid or https://…"
            className="h-8 font-mono text-xs"
          />
        </Field>

        {/* configId (read-only display) */}
        <Field label="Config ID">
          <div className="rounded-[var(--ds-radius-md,2px)] border border-[var(--ds-border-primary)] bg-[var(--ds-surface-secondary)] px-2 py-1.5 font-mono text-xs text-[var(--ds-text-secondary)]">
            {entry.configId || deriveTemplateConfigId(entry.componentType, entry.componentSubType) || "—"}
          </div>
          <span className="text-[10px] text-muted-foreground">Every instance of this component runs on this config row.</span>
        </Field>

        {/* Flags */}
        <Section title="Behaviour">
          <Toggle
            label="Singleton — only one instance, focus existing on next click"
            checked={entry.singleton}
            onChange={handleSingletonToggle}
          />
          <Toggle
            label="External — component lives outside this app"
            checked={entry.type === "external"}
            onChange={(next) => onChange({ type: next ? "external" : "internal", usesHostConfig: !next })}
          />
        </Section>

        {/* Host surface — separate platform window vs. a view docked
            into the Workspace browser window. Seeds `asWindow` on the
            dock placement when this component is added to the dock
            (a one-time snapshot, same as icon/name), and drives which
            surface "Configure Component" previews below. */}
        <HostSurfacePicker
          asWindow={entry.asWindow}
          onChange={(asWindow) => onChange({ asWindow })}
        />

        {/* External-only fields */}
        {entry.type === "external" && (
          <Section title="External component hints (optional)">
            <Field label="App ID">
              <Input
                value={entry.appId}
                onChange={(e) => onChange({ appId: e.target.value })}
                className="h-8 font-mono text-xs"
              />
            </Field>
            <Field label="ConfigService URL">
              <Input
                value={entry.configServiceUrl}
                onChange={(e) => onChange({ configServiceUrl: e.target.value })}
                className="h-8 font-mono text-xs"
              />
            </Field>
          </Section>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-[var(--ds-border-primary)] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void onTest(entry)}
              disabled={!entry.hostUrl}
              className="h-8 gap-1.5 px-3 text-xs"
              title="Open this component on its template row to author its profiles and settings"
            >
              <PlayCircle className="h-3.5 w-3.5" aria-hidden /> Configure Component
            </Button>
            {!isInDock && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onAddToDock(entry)}
                disabled={!entry.hostUrl}
                className="h-8 gap-1.5 px-3 text-xs"
              >
                <ArrowRight className="h-3.5 w-3.5" aria-hidden /> Add to your dock
              </Button>
            )}
          </div>
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {isInDock
              ? <><Check className="h-3 w-3 text-[var(--ds-accent-positive)]" aria-hidden /> In your dock</>
              : "Not in your dock yet — click \"Add to your dock\" to surface it"}
          </span>
        </div>

        {/* "In your dock at" reverse-link footer — every dock placement
            shows as a click-to-jump row so users can navigate directly
            from a component to where it appears in the dock. */}
        {placements.length > 0 && (
          <Section title="In your dock at">
            {placements.map((p) => (
              <button
                key={`${p.buttonId}-${p.path}`}
                type="button"
                onClick={() => onSelect({ kind: "dock-item", itemId: p.buttonId })}
                className="flex items-center gap-1.5 rounded-[var(--ds-radius-sm,2px)] px-1.5 py-1 text-left text-[11px] text-[var(--ds-text-secondary)] transition-colors hover:bg-[var(--ds-surface-tertiary)] hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{p.path}</span>
              </button>
            ))}
          </Section>
        )}
      </div>
    </PaneShell>
  );
}

// ─── Dock item inspector ─────────────────────────────────────────────

/**
 * Resolve the selected dock-item id to either a top-level button or a
 * nested menu item. Returning a discriminated union lets the inspector
 * route its edits to the correct dispatcher (UPDATE_BUTTON vs.
 * UPDATE_MENU_ITEM) and surface the right "type" label.
 */
type ResolvedDockEntity =
  | { kind: "button"; button: DockButtonConfig }
  | {
      kind: "menuItem";
      topButtonId: string;
      parentItemId: string | undefined;
      item: DockMenuItemConfig;
    };

function resolveDockEntity(
  buttons: DockButtonConfig[],
  itemId: string,
): ResolvedDockEntity | null {
  for (const b of buttons) {
    if (b.id === itemId) return { kind: "button", button: b };
    if (b.type === "DropdownButton") {
      const found = findInOptions((b as DockDropdownButtonConfig).options ?? [], itemId, undefined);
      if (found) {
        return { kind: "menuItem", topButtonId: b.id, parentItemId: found.parentItemId, item: found.item };
      }
    }
  }
  return null;
}

function findInOptions(
  items: DockMenuItemConfig[],
  itemId: string,
  parentItemId: string | undefined,
): { item: DockMenuItemConfig; parentItemId: string | undefined } | null {
  for (const it of items) {
    if (it.id === itemId) return { item: it, parentItemId };
    if (it.options?.length) {
      const nested = findInOptions(it.options, itemId, it.id);
      if (nested) return nested;
    }
  }
  return null;
}

function DockItemInspector({
  itemId,
  buttons,
  entries,
  onEditButton,
  onEditMenuItem,
  onSelect,
}: {
  itemId: string;
  buttons: DockButtonConfig[];
  entries: RegistryEntry[];
  onEditButton: (buttonId: string, patch: Partial<DockButtonConfig>) => void;
  onEditMenuItem: (
    topButtonId: string,
    itemId: string,
    parentItemId: string | undefined,
    patch: Partial<DockMenuItemConfig>,
  ) => void;
  onSelect: (sel: EditorSelection) => void;
}) {
  const resolved = resolveDockEntity(buttons, itemId);
  if (!resolved) {
    return (
      <PaneShell title="Dock item">
        <Notice>Selected dock item no longer exists. It may have been removed.</Notice>
      </PaneShell>
    );
  }

  // Surface common fields uniformly across button / menuItem.
  const label = resolved.kind === "button" ? resolved.button.tooltip : resolved.item.tooltip;
  const iconId =
    resolved.kind === "button" ? resolved.button.iconId ?? "" : resolved.item.iconId ?? "";
  const actionId =
    resolved.kind === "button"
      ? (resolved.button as { actionId?: string }).actionId
      : resolved.item.actionId;
  const customData =
    resolved.kind === "button"
      ? (resolved.button as { customData?: unknown }).customData
      : resolved.item.customData;

  const isLaunchComponent = actionId === ACTION_LAUNCH_COMPONENT;
  const refId = isLaunchComponent
    ? (customData as { registryEntryId?: string } | undefined)?.registryEntryId
    : undefined;
  const referenced = refId ? entries.find((e) => e.id === refId) : null;
  const broken = isLaunchComponent && refId && !referenced;

  // Single edit dispatcher — both forms use the same fields, only the
  // routing differs.
  const setLabel = (next: string) => {
    if (resolved.kind === "button") {
      onEditButton(resolved.button.id, { tooltip: next } as Partial<DockButtonConfig>);
    } else {
      onEditMenuItem(resolved.topButtonId, resolved.item.id, resolved.parentItemId, { tooltip: next });
    }
  };
  const setIconId = (next: string) => {
    if (resolved.kind === "button") {
      onEditButton(resolved.button.id, { iconId: next } as Partial<DockButtonConfig>);
    } else {
      onEditMenuItem(resolved.topButtonId, resolved.item.id, resolved.parentItemId, { iconId: next });
    }
  };

  const typeLine =
    resolved.kind === "button"
      ? `${resolved.button.type === "DropdownButton" ? "Dropdown (with menu items)" : "Action button"}${isLaunchComponent ? " · launches a component" : ""}`
      : `Menu item${(resolved.item.options?.length ?? 0) > 0 ? " (sub-menu)" : ""}${isLaunchComponent ? " · launches a component" : ""}`;

  return (
    <PaneShell title="Dock item">
      <div className="flex flex-col gap-4">
        {/* Icon + Label — per-placement overrides */}
        <div className="flex items-end gap-2">
          <IconField iconId={iconId} onChange={setIconId} />
          <div className="flex-1">
            <Field label="Label">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-8 text-xs"
              />
            </Field>
          </div>
        </div>
        {referenced && (
          <div className="-mt-2 text-[10px] text-muted-foreground">
            Component default icon: <span className="font-mono text-[var(--ds-text-secondary)]">{referenced.iconId || "—"}</span>{" "}
            · this placement's own label and icon win.
          </div>
        )}

        <Meta label="Type">
          <div className="rounded-[var(--ds-radius-md,2px)] border border-[var(--ds-border-primary)] bg-[var(--ds-surface-secondary)] px-2 py-1.5 text-xs text-[var(--ds-text-secondary)]">
            {typeLine}
          </div>
        </Meta>

        {isLaunchComponent && (
          <Meta label="Launches component">
            {broken && (
              <Notice tone="warning">
                Component <code>{refId}</code> was deleted. Remove this dock item or restore the component.
              </Notice>
            )}
            {referenced && (
              <button
                type="button"
                onClick={() => onSelect({ kind: "component", entryId: referenced.id })}
                className="flex w-full items-center gap-2 rounded-[var(--ds-radius-md,2px)] border border-[var(--ds-border-primary)] bg-[var(--ds-surface-secondary)] px-2 py-1.5 text-left text-[11px] text-[var(--ds-text-secondary)] transition-colors hover:border-[var(--ds-border-secondary)] hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">
                  {referenced.displayName} <span className="font-mono text-muted-foreground">({referenced.componentType}/{referenced.componentSubType})</span>
                </span>
              </button>
            )}
          </Meta>
        )}
      </div>
    </PaneShell>
  );
}

// ─── Layout primitives ───────────────────────────────────────────────

function PaneShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Inspector">
      <PaneHeader title={title} subtitle={subtitle} />
      <div className="bn-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// Same heading as Field for read-only content and buttons. Not a <label>:
// a button inside a label takes the label as its accessible name, which
// would hide what the button actually does.
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--ds-radius-md,2px)] border border-[var(--ds-border-primary)] bg-[var(--ds-surface-secondary)] p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Notice({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" }) {
  const warning = tone === "warning";
  return (
    <div
      className="flex items-start gap-2 rounded-[var(--ds-radius-md,2px)] border p-2 text-[11px] leading-relaxed"
      style={{
        background: "var(--ds-surface-secondary)",
        borderColor: warning ? "var(--ds-accent-warning)" : "var(--ds-border-primary)",
        color: warning ? "var(--ds-accent-warning)" : "var(--ds-text-secondary)",
      }}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
      />
      <span className="text-xs text-[var(--ds-text-secondary)]">{label}</span>
    </label>
  );
}

// ─── Host surface picker (platform window vs. workspace browser view) ─
//
// A segmented pair, not a checkbox: "Host as" is a mutually exclusive
// choice, not an additive flag like Singleton/External. Mirrors
// `RegistryEntry.asWindow` — false (default) docks the component as a
// view inside the OpenFin Workspace browser window; true opens it as
// its own standalone OpenFin platform window.

function HostSurfacePicker({
  asWindow,
  onChange,
}: {
  asWindow: boolean;
  onChange: (asWindow: boolean) => void;
}) {
  const segment = (active: boolean) =>
    `px-2.5 py-1.5 text-xs transition-colors ${active
      ? "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)]"
      : "bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)] hover:text-foreground"}`;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Host as
      </span>
      <div className="inline-flex w-fit overflow-hidden rounded-[var(--ds-radius-md,2px)] border border-[var(--ds-border-primary)]">
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={!asWindow}
          title="Dock as a view inside the OpenFin Workspace browser window"
          className={segment(!asWindow)}
        >
          Workspace browser view
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={asWindow}
          title="Open as its own standalone OpenFin platform window"
          className={`border-l border-[var(--ds-border-primary)] ${segment(asWindow)}`}
        >
          Platform window
        </button>
      </div>
    </div>
  );
}

// ─── Icon field with picker popover ──────────────────────────────────
//
// Click the swatch to open a searchable grid (IconPicker). Selecting an
// icon writes the iconId back via onChange and closes the popover. The
// swatch renders the icon inline, so it is theme-correct and needs no
// network. Empty iconId → an ImageIcon placeholder ("no icon set").

function IconField({ iconId, onChange }: { iconId: string; onChange: (iconId: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Icon
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--ds-radius-md,2px)] border border-[var(--ds-border-primary)] bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)] transition-colors hover:border-[var(--ds-border-secondary)] hover:text-foreground"
            title={iconId ? `Icon: ${iconId} — click to change` : "Pick an icon"}
            aria-label={iconId ? `Icon: ${iconId} — click to change` : "Pick an icon"}
          >
            {iconId
              ? <DynamicIcon icon={iconId} style={{ width: 18, height: 18 }} />
              : <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />}
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[360px] border-[var(--ds-border-primary)] bg-background p-2 text-foreground"
          align="start"
        >
          {open && (
            <IconPicker
              selectedIcon={iconId}
              color="currentColor"
              onSelect={(id) => {
                onChange(id);
                setOpen(false);
              }}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
