"use client";

/**
 * WorkspaceSetup — the unified 3-pane editor that supersedes the
 * separate Dock Editor and Registry Editor windows.
 *
 *   ① COMPONENTS  →  ② DOCK LAYOUT  →  ③ INSPECTOR
 *   (catalog —      (where they         (form for whatever
 *    global)         appear — per-       is selected)
 *                    user)
 *
 * Mounted in a separate OpenFin child window. The parent provider
 * forwards its `(appId, userId)` scope via `customData` so this child
 * persists registry + dock rows under the same scope the provider's
 * other surfaces read from. Without that, saves land at the legacy
 * `(system, system)` default while boot-time migrations relocate rows
 * onto the real platform scope, leaving the editor empty on the next
 * open. See `workspace.ts`'s ACTION_OPEN_WORKSPACE_SETUP launcher.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { injectEditorStyles } from "@wellsfargo-starui/core";
import { useRegistryEditor } from "./registry/useRegistryEditor";
import {
  ACTION_LAUNCH_COMPONENT,
  readHostEnv,
  setPlatformDefaultScope,
  deriveTemplateConfigId,
  cloneRegistryTemplateConfig,
  type ConfigScope,
  type RegistryEntry,
  type DockButtonConfig,
  type DockDropdownButtonConfig,
  type DockMenuItemConfig,
} from "@wellsfargo-starui/openfin/config";
import { useDockEditor } from "./hooks/useDockEditor";
import { ComponentsPane } from "./components/workspace-setup/ComponentsPane";
import { InspectorPane } from "./components/workspace-setup/InspectorPane";
import { DockPane } from "./components/workspace-setup/DockPane";
import { newDraftEntry } from "./components/workspace-setup/types";
import type { EditorSelection } from "./components/workspace-setup/types";

// ─── Outer shell ─────────────────────────────────────────────────────
// Reads the platform scope forwarded via OpenFin customData, primes
// db.ts's module-level default, then mounts the body with an explicit
// scope so both editor hooks load from and save to the same row the
// provider operates under.

export function WorkspaceSetup() {
  useEffect(() => { injectEditorStyles(); }, []);

  const [scope, setScope] = useState<ConfigScope | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const env = await readHostEnv();
        const resolved: ConfigScope = {
          appId: env.appId || undefined,
          userId: env.userId || undefined,
        };
        // Defensive: also prime the module-level default so any helper
        // that doesn't accept an explicit scope (e.g. internal
        // migrations) sees the right values too.
        if (resolved.appId || resolved.userId) {
          setPlatformDefaultScope(resolved);
        }
        if (!cancelled) setScope(resolved);
      } catch (err) {
        console.warn("WorkspaceSetup: failed to read host env, falling back to platform default", err);
        if (!cancelled) setScope({});
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (scope === null) {
    return (
      <div
        className="flex items-center justify-center h-full w-full bg-background text-muted-foreground"
      >
        <span className="text-xs">Loading workspace setup…</span>
      </div>
    );
  }

  return <WorkspaceSetupBody scope={scope} />;
}

// ─── Editor body ─────────────────────────────────────────────────────

function WorkspaceSetupBody({ scope }: { scope: ConfigScope }) {
  const registry = useRegistryEditor({ scope });
  const dock = useDockEditor({ scope });

  const [selection, setSelection] = useState<EditorSelection>({ kind: "none" });

  // Maps draft entry id → source template configId for clones whose
  // AppConfigRow copy is retried at save if the immediate clone failed.
  const pendingTemplateClonesRef = useRef(new Map<string, string>());

  // For pane ①'s "in dock" badge + filter chips, and for the Inspector's
  // "currently in your dock" footer.
  const inDockEntryIds = useMemo(() => {
    const ids = new Set<string>();
    const visit = (item: { actionId?: string; customData?: unknown; options?: unknown[] }): void => {
      if (item.actionId === ACTION_LAUNCH_COMPONENT) {
        const cd = (item.customData ?? {}) as { registryEntryId?: string };
        if (cd.registryEntryId) ids.add(cd.registryEntryId);
      }
      const opts = (item.options ?? []) as Array<{ actionId?: string; customData?: unknown; options?: unknown[] }>;
      for (const sub of opts) visit(sub);
    };
    for (const btn of dock.buttons) visit(btn as never);
    return ids;
  }, [dock.buttons]);

  const summary = useMemo(() => ({
    totalComponents: registry.entries.length,
    inDock: inDockEntryIds.size,
    singletons: registry.entries.filter((e) => e.singleton).length,
    dockButtons: dock.buttons.length,
  }), [registry.entries, inDockEntryIds, dock.buttons]);

  // ─── Component CRUD bridges ─────────────────────────────────────
  const handleAddDraft = useCallback(() => {
    const entry = newDraftEntry(registry.hostEnv);
    registry.dispatch({ type: "ADD_ENTRY", entry });
    setSelection({ kind: "component", entryId: entry.id });
  }, [registry]);

  // Clone a registry entry into a fresh draft, opened in the inspector.
  //
  // The data model keys every entry — and its settings-template config
  // row — by `${componentType}-${componentSubType}` (see
  // `deriveTemplateConfigId`), with at most one entry per pair. A clone
  // therefore MUST differ on that pair or it would derive the same
  // canonical id as its source and collide on save. We keep the
  // componentType and mint a unique componentSubType (`<sub>-copy`,
  // `<sub>-copy-2`, …), plus a de-duplicated "(copy)" display name.
  // `id`/`configId` are reset (a temp draft id now; both re-derive from
  // the final pair on save) and the clone is selected so the user can
  // rename it in pane ③ before committing.
  //
  // The registry entry is only launch metadata — profiles, grid options,
  // styling, and theme live on the template AppConfigRow. We deep-clone
  // that row onto the clone's derived template id immediately so test-
  // launch and dock use work before the user saves the registry.
  const handleClone = useCallback((entryId: string) => {
    const src = registry.entries.find((e) => e.id === entryId);
    if (!src) return;

    const names = new Set(registry.entries.map((e) => e.displayName));
    const pairs = new Set(
      registry.entries
        .filter((e) => e.componentType && e.componentSubType)
        .map((e) => pairKey(e.componentType, e.componentSubType)),
    );
    const bothSet = Boolean(src.componentType && src.componentSubType);

    const cloned: RegistryEntry = {
      ...src,
      id: `draft-${newId()}`,
      configId: "",
      displayName: uniqueDisplayName(src.displayName || "Component", names),
      componentSubType: bothSet
        ? uniqueSubType(src.componentType, src.componentSubType, pairs)
        : src.componentSubType,
      createdAt: new Date().toISOString(),
    };

    registry.dispatch({ type: "ADD_ENTRY", entry: cloned });
    setSelection({ kind: "component", entryId: cloned.id });

    if (bothSet) {
      const sourceTemplateId =
        src.configId ||
        deriveTemplateConfigId(src.componentType, src.componentSubType);
      pendingTemplateClonesRef.current.set(cloned.id, sourceTemplateId);
      void cloneRegistryTemplateConfig({
        sourceTemplateId,
        targetComponentType: cloned.componentType,
        targetComponentSubType: cloned.componentSubType,
        displayText: cloned.displayName,
        singleton: cloned.singleton,
      });
    }
  }, [registry]);

  // Delete a registry entry AND prune any dock items that reference it.
  // Without the cascade, removing a component leaves orphaned ActionButtons
  // and DropdownButton menu items pointing at the dead `registryEntryId` —
  // the InspectorPane shows a "Component deleted" warning but the dock
  // itself still tries to launch the missing component on click.
  const handleDelete = useCallback((entryId: string) => {
    pruneDockReferencesTo(entryId, dock.buttons, dock.dispatch);
    registry.dispatch({ type: "REMOVE_ENTRY", id: entryId });
    if (selection.kind === "component" && selection.entryId === entryId) {
      setSelection({ kind: "none" });
    }
  }, [registry, dock, selection]);

  const handleEntryChange = useCallback((id: string, patch: Partial<RegistryEntry>) => {
    const current = registry.entries.find((e) => e.id === id);
    if (!current) return;
    registry.dispatch({ type: "UPDATE_ENTRY", id, entry: { ...current, ...patch } });
  }, [registry]);

  // ─── Dock CRUD bridges ──────────────────────────────────────────
  const handleAddToDock = useCallback((entry: RegistryEntry) => {
    if (inDockEntryIds.has(entry.id)) return;
    const newButtonId = newId();
    dock.dispatch({
      type: "ADD_BUTTON",
      button: {
        type: "ActionButton",
        id: newButtonId,
        tooltip: entry.displayName || "Untitled",
        iconUrl: "",
        iconId: entry.iconId,
        iconColor: "",
        actionId: ACTION_LAUNCH_COMPONENT,
        customData: {
          registryEntryId: entry.id,
          asWindow: entry.asWindow,
        },
      },
    });
    setSelection({ kind: "dock-item", itemId: newButtonId });
  }, [dock, inDockEntryIds]);

  const handleRemoveFromDock = useCallback((buttonId: string) => {
    dock.dispatch({ type: "REMOVE_BUTTON", id: buttonId });
    if (selection.kind === "dock-item" && selection.itemId === buttonId) {
      setSelection({ kind: "none" });
    }
  }, [dock, selection]);

  const handleReorderDock = useCallback((fromIndex: number, toIndex: number) => {
    const max = dock.buttons.length - 1;
    if (toIndex < 0 || toIndex > max || fromIndex === toIndex) return;
    dock.dispatch({ type: "REORDER_BUTTONS", fromIndex, toIndex });
  }, [dock]);

  // Per-item override editor: lets the inspector update label + icon on a
  // top-level dock button. Snapshot semantics — the dock item carries its
  // own iconId/tooltip independent of the underlying component, so editing
  // here does not mutate the registry entry.
  const handleEditButton = useCallback((buttonId: string, patch: Partial<DockButtonConfig>) => {
    const current = dock.buttons.find((b) => b.id === buttonId);
    if (!current) return;
    dock.dispatch({
      type: "UPDATE_BUTTON",
      id: buttonId,
      button: { ...current, ...patch } as DockButtonConfig,
    });
  }, [dock]);

  // Nested menu-item edit: the inspector resolves a selected menu item
  // to its top-level dropdown's id + the chain to its direct parent,
  // then calls this with a patch for the leaf item.
  const handleEditMenuItem = useCallback(
    (
      topButtonId: string,
      itemId: string,
      parentItemId: string | undefined,
      patch: Partial<DockMenuItemConfig>,
    ) => {
      // Locate the existing item to merge the patch onto.
      const top = dock.buttons.find((b) => b.id === topButtonId);
      if (!top || top.type !== "DropdownButton") return;
      const found = findMenuItem((top as DockDropdownButtonConfig).options ?? [], itemId);
      if (!found) return;
      dock.dispatch({
        type: "UPDATE_MENU_ITEM",
        buttonId: topButtonId,
        itemId,
        parentItemId,
        item: { ...found, ...patch },
      });
    },
    [dock],
  );

  // ─── Dropdown authoring ─────────────────────────────────────────
  // Create an empty DropdownButton. The user fills it via "+ Add" on
  // the dropdown row; until then it's a labelled empty group that
  // surfaces as a folder in the dock content menu.
  const handleCreateDropdown = useCallback(() => {
    const id = newId();
    dock.dispatch({
      type: "ADD_BUTTON",
      button: {
        type: "DropdownButton",
        id,
        tooltip: "New menu",
        iconUrl: "",
        iconId: "lucide:folder",
        iconColor: "",
        options: [],
      },
    });
    setSelection({ kind: "dock-item", itemId: id });
  }, [dock]);

  // Add a registered component as a child of an existing dropdown
  // button. The child carries its own iconId/tooltip/asWindow (snapshot),
  // so future edits to the registry entry don't propagate automatically —
  // matches the top-level Add To Dock semantics.
  const handleAddComponentToDropdown = useCallback((parentButtonId: string, entry: RegistryEntry) => {
    const id = newId();
    dock.dispatch({
      type: "ADD_MENU_ITEM",
      buttonId: parentButtonId,
      item: {
        id,
        tooltip: entry.displayName || "Untitled",
        iconId: entry.iconId,
        actionId: ACTION_LAUNCH_COMPONENT,
        customData: { registryEntryId: entry.id, asWindow: entry.asWindow },
      },
    });
  }, [dock]);

  // Remove a menu item (leaf or sub-folder). buttonId is the top-level
  // dropdown that owns the subtree; itemId is the menu item to remove;
  // parentItemId scopes nested removals.
  const handleRemoveMenuItem = useCallback(
    (buttonId: string, itemId: string, parentItemId?: string) => {
      dock.dispatch({ type: "REMOVE_MENU_ITEM", buttonId, itemId, parentItemId });
      if (selection.kind === "dock-item" && selection.itemId === itemId) {
        setSelection({ kind: "none" });
      }
    },
    [dock, selection],
  );

  // Save — writes BOTH registry and dock if dirty.
  //
  // ID-rename atomicity: the registry's `save()` will normalise every
  // entry's `id` and `configId` to `${componentType}-${componentSubType}`
  // (lowercase). Drafts that came in with a temp UUID get rewritten.
  // Before that happens we walk every dock item and rewrite its
  // `customData.registryEntryId` so it points at the canonical id —
  // otherwise the dock would persist a dangling reference to the temp
  // UUID and clicking the button at runtime wouldn't find the entry.
  //
  // Order of operations:
  //   1. Build the old-id → new-id map from the current registry state.
  //   2. Walk dock buttons + dropdown items + menu items and dispatch
  //      ID-rewrite UPDATE actions for any that reference an entry
  //      whose id is about to change.
  //   3. registry.save() (writes the canonical-ids version to disk).
  //   4. dock.save()     (writes the rewritten references to disk).
  // Both reads happen against the SAME state snapshot, so the rename
  // is atomic from the user's perspective.
  const handleSaveAll = useCallback(async () => {
    if (registry.isDirty || dock.isDirty) {
      // 1. Build the id-rename map.
      const renameMap = new Map<string, string>();
      for (const e of registry.entries) {
        if (!e.componentType || !e.componentSubType) continue;
        const canonical = deriveTemplateConfigId(e.componentType, e.componentSubType);
        if (canonical && canonical !== e.id) renameMap.set(e.id, canonical);
      }

      // 2. Rewrite dock references in-place via dock dispatch. The
      //    dock reducer's UPDATE_BUTTON / UPDATE_OPTION / UPDATE_MENU_ITEM
      //    actions handle deep replacements; we patch the customData.
      if (renameMap.size > 0) {
        rewriteDockRegistryEntryIds(dock.buttons, dock.dispatch, renameMap);
      }

      // 2b. Deep-clone template AppConfigRows for any pending clones
      //     (retry if the immediate clone on handleClone failed).
      for (const e of registry.entries) {
        const sourceTemplateId = pendingTemplateClonesRef.current.get(e.id);
        if (!sourceTemplateId || !e.componentType || !e.componentSubType) continue;
        await cloneRegistryTemplateConfig({
          sourceTemplateId,
          targetComponentType: e.componentType,
          targetComponentSubType: e.componentSubType,
          displayText: e.displayName,
          singleton: e.singleton,
        });
      }
    }
    if (registry.isDirty) await registry.save();
    if (dock.isDirty) await dock.save();
    pendingTemplateClonesRef.current.clear();
  }, [registry, dock]);

  // Discard — non-destructive: re-load from storage. Replaces the previous
  // implementation which called `clearRegistryConfig`/`clearDockConfig`
  // and silently wiped IndexedDB. That destroyed the user's catalog
  // every time they pressed Discard expecting "revert my edits".
  const handleDiscard = useCallback(async () => {
    await Promise.all([registry.reload(), dock.reload()]);
    setSelection({ kind: "none" });
  }, [registry, dock]);

  const isDirty = registry.isDirty || dock.isDirty;

  return (
    <div
      data-dock-editor=""
      className="flex flex-col h-full w-full overflow-hidden bg-background text-foreground"
    >
      {/* Fixed header — title + unsaved badge */}
      <header
        className="flex items-center justify-between px-4 py-2 border-b shrink-0 border-[var(--ds-border-primary)] bg-background"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Workspace Setup</span>
          <span className="text-[10px] text-muted-foreground">
            {summary.totalComponents} component{summary.totalComponents === 1 ? "" : "s"} · {summary.dockButtons} dock button{summary.dockButtons === 1 ? "" : "s"}
          </span>
        </div>
        {isDirty && (
          <span className="text-[10px] flex items-center gap-1 text-[var(--ds-accent-warning)]">
            <span>●</span> Unsaved changes
          </span>
        )}
      </header>

      {/* Scrollable body — only the panes' inner content scrolls; the
          outer container has overflow-hidden so no scrollbar appears
          on the shell itself. */}
      <main className="flex-1 grid grid-cols-[320px_1fr_360px] min-h-0 min-w-0 overflow-hidden">
        <ComponentsPane
          entries={registry.entries}
          inDockEntryIds={inDockEntryIds}
          selection={selection}
          onSelect={setSelection}
          onAddDraft={handleAddDraft}
          onClone={handleClone}
          onDelete={handleDelete}
          onTest={registry.testComponent}
        />
        <DockPane
          dock={{ version: 1, buttons: dock.buttons, updatedAt: "" }}
          entries={registry.entries}
          selection={selection}
          onSelect={setSelection}
          onRemove={handleRemoveFromDock}
          onReorder={handleReorderDock}
          onCreateDropdown={handleCreateDropdown}
          onAddComponentToDropdown={handleAddComponentToDropdown}
          onRemoveMenuItem={handleRemoveMenuItem}
        />
        <InspectorPane
          selection={selection}
          entries={registry.entries}
          buttons={dock.buttons}
          onChange={handleEntryChange}
          onEditButton={handleEditButton}
          onEditMenuItem={handleEditMenuItem}
          onTest={registry.testComponent}
          onAddToDock={handleAddToDock}
          onSelect={setSelection}
          inDockEntryIds={inDockEntryIds}
          summary={summary}
        />
      </main>

      {/* Fixed footer — Save / Discard. Anchored at the bottom so primary
          actions are reachable regardless of which pane is scrolled. */}
      <footer
        className="flex items-center justify-end gap-2 px-4 py-2 border-t shrink-0 border-[var(--ds-border-primary)] bg-background"
      >
        <button
          type="button"
          onClick={() => { void handleDiscard(); }}
          disabled={!isDirty}
          className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 bg-[var(--ds-surface-secondary)] text-[var(--ds-text-secondary)] border border-[var(--ds-border-primary)]"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={() => { void handleSaveAll(); }}
          disabled={!isDirty}
          className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 bg-[var(--de-accent)] text-[var(--de-accent-foreground)]"
        >
          Save
        </button>
      </footer>
    </div>
  );
}

// ─── Local helpers ───────────────────────────────────────────────────

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// ─── Clone helpers ───────────────────────────────────────────────────
//
// `pairKey` canonicalises a (componentType, componentSubType) pair the
// same lowercase way `deriveTemplateConfigId` does, so the uniqueness
// check below matches the rule the registry enforces at save time. A
// space separator is unambiguous here — component classifications are
// single tokens (GRID, CREDIT, RATES) and never contain spaces.

function pairKey(componentType: string, componentSubType: string): string {
  return `${componentType} ${componentSubType}`.toLowerCase();
}

/** First free "<base> (copy)" / "<base> (copy N)" not already in use. */
function uniqueDisplayName(base: string, existing: Set<string>): string {
  let candidate = `${base} (copy)`;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `${base} (copy ${n})`;
    n += 1;
  }
  return candidate;
}

/** First free "<base>-copy" / "<base>-copy-N" whose (type, sub) pair is unused. */
function uniqueSubType(componentType: string, base: string, existingPairs: Set<string>): string {
  let candidate = `${base}-copy`;
  let n = 2;
  while (existingPairs.has(pairKey(componentType, candidate))) {
    candidate = `${base}-copy-${n}`;
    n += 1;
  }
  return candidate;
}

function findMenuItem(items: DockMenuItemConfig[], itemId: string): DockMenuItemConfig | null {
  for (const it of items) {
    if (it.id === itemId) return it;
    if (it.options?.length) {
      const nested = findMenuItem(it.options, itemId);
      if (nested) return nested;
    }
  }
  return null;
}

// ─── Cascade prune helper ────────────────────────────────────────────
//
// Walks the dock tree and dispatches removals for every item whose
// `customData.registryEntryId` matches `entryId`. Top-level matches
// fire `REMOVE_BUTTON`; nested matches inside dropdowns fire
// `REMOVE_MENU_ITEM` with the right `parentItemId` chain.
//
// Items are removed deepest-first within each branch so parent-id
// references stay valid through the dispatch sequence.

type DockEditorDispatch = ReturnType<typeof useDockEditor>["dispatch"];

function pruneDockReferencesTo(
  entryId: string,
  buttons: DockButtonConfig[],
  dispatch: DockEditorDispatch,
): void {
  for (const btn of buttons) {
    if (btn.type === "ActionButton") {
      if (referencesEntry(btn.customData, entryId)) {
        dispatch({ type: "REMOVE_BUTTON", id: btn.id });
      }
      continue;
    }
    // DropdownButton — walk its options and dispatch removals for matches.
    const dropdown = btn as DockDropdownButtonConfig;
    const removals: Array<{ buttonId: string; itemId: string; parentItemId?: string }> = [];
    collectMenuItemRemovals(dropdown.options ?? [], dropdown.id, undefined, entryId, removals);
    // Removing leaf items first keeps parent references stable; the
    // collector emits in pre-order, so we reverse before dispatch.
    for (const r of removals.reverse()) {
      dispatch({ type: "REMOVE_MENU_ITEM", buttonId: r.buttonId, itemId: r.itemId, parentItemId: r.parentItemId });
    }
  }
}

function referencesEntry(customData: unknown, entryId: string): boolean {
  const cd = customData as { registryEntryId?: string } | undefined;
  return cd?.registryEntryId === entryId;
}

function collectMenuItemRemovals(
  items: DockMenuItemConfig[],
  buttonId: string,
  parentItemId: string | undefined,
  entryId: string,
  acc: Array<{ buttonId: string; itemId: string; parentItemId?: string }>,
): void {
  for (const item of items) {
    if (referencesEntry(item.customData, entryId)) {
      acc.push({ buttonId, itemId: item.id, parentItemId });
    }
    if (item.options?.length) {
      collectMenuItemRemovals(item.options, buttonId, item.id, entryId, acc);
    }
  }
}

// ─── ID-rename cascade helper ───────────────────────────────────────
//
// Sister of `pruneDockReferencesTo`: walks the dock tree and rewrites
// every `customData.registryEntryId` whose value appears as a key in
// the rename map. Used at save time to keep dock references aligned
// with the registry's just-normalised entry ids (`temp-uuid` →
// `${componentType}-${componentSubType}`).

function rewriteDockRegistryEntryIds(
  buttons: DockButtonConfig[],
  dispatch: DockEditorDispatch,
  renameMap: Map<string, string>,
): void {
  for (const btn of buttons) {
    if (btn.type === "ActionButton") {
      const cd = btn.customData as { registryEntryId?: string; asWindow?: boolean } | undefined;
      const oldId = cd?.registryEntryId;
      const newId = oldId ? renameMap.get(oldId) : undefined;
      if (newId) {
        dispatch({
          type: "UPDATE_BUTTON",
          id: btn.id,
          button: { ...btn, customData: { ...(cd ?? {}), registryEntryId: newId } },
        });
      }
      continue;
    }
    // DropdownButton — walk options, dispatch UPDATE_MENU_ITEM for each match.
    const dropdown = btn as DockDropdownButtonConfig;
    const renames: Array<{ buttonId: string; itemId: string; parentItemId?: string; nextItem: DockMenuItemConfig }> = [];
    collectMenuItemRenames(dropdown.options ?? [], dropdown.id, undefined, renameMap, renames);
    for (const r of renames) {
      dispatch({
        type: "UPDATE_MENU_ITEM",
        buttonId: r.buttonId,
        itemId: r.itemId,
        parentItemId: r.parentItemId,
        item: r.nextItem,
      });
    }
  }
}

function collectMenuItemRenames(
  items: DockMenuItemConfig[],
  buttonId: string,
  parentItemId: string | undefined,
  renameMap: Map<string, string>,
  acc: Array<{ buttonId: string; itemId: string; parentItemId?: string; nextItem: DockMenuItemConfig }>,
): void {
  for (const item of items) {
    const cd = item.customData as { registryEntryId?: string; asWindow?: boolean } | undefined;
    const oldId = cd?.registryEntryId;
    const newId = oldId ? renameMap.get(oldId) : undefined;
    if (newId) {
      acc.push({
        buttonId,
        itemId: item.id,
        parentItemId,
        nextItem: {
          ...item,
          customData: { ...(cd ?? {}), registryEntryId: newId },
        },
      });
    }
    if (item.options?.length) {
      collectMenuItemRenames(item.options, buttonId, item.id, renameMap, acc);
    }
  }
}

export default WorkspaceSetup;
