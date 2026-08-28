/**
 * Shared helpers for registering a launchable component and putting it on
 * the OpenFin dock, using StarUI's existing generic Component Registry +
 * Dock system (`@wellsfargo-starui/openfin/config`).
 *
 * Used by both the AI Assistant's own bootstrap registration
 * (`ensureDockButton.ts`) and the `create_blotter` tool
 * (`useToolExecutor.ts`), so there's one implementation of "add an entry"
 * and "add a dock button" rather than two that can drift.
 *
 * `ACTION_LAUNCH_COMPONENT` is a pre-existing, already-wired system dock
 * action: clicking a button carrying it resolves `customData.registryEntryId`
 * against the live registry and opens that entry's `hostUrl` — as a real
 * OpenFin platform window when `asWindow` is true.
 */
import {
  loadRegistryConfig,
  saveRegistryConfig,
  loadDockConfig,
  saveDockConfig,
  ACTION_LAUNCH_COMPONENT,
  IAB_DOCK_CONFIG_UPDATE,
  IAB_REGISTRY_CONFIG_UPDATE,
  REGISTRY_CONFIG_VERSION,
  type RegistryEntry,
  type RegistryEditorConfig,
  type DockEditorConfig,
  type DockButtonConfig,
  type DockDropdownButtonConfig,
  type DockMenuItemConfig,
} from '@wellsfargo-starui/openfin/config';

/**
 * Dropdown the AI Assistant files blotters under. A dock that accumulates one
 * top-level button per blotter stops being navigable after a handful; grouping
 * them under one menu is what the Dock Editor's dropdowns are for.
 */
export const BLOTTER_DOCK_GROUP = 'Assets';

/** Dropdown labels are matched the way a user would read them. */
function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** True when this button/menu item launches `registryEntryId`. */
function launches(node: { customData?: unknown }, registryEntryId: string): boolean {
  return (node.customData as { registryEntryId?: string } | undefined)?.registryEntryId === registryEntryId;
}

/** Depth-first walk of a dropdown's menu items, including nested sub-menus. */
function anyItem(items: readonly DockMenuItemConfig[], pred: (item: DockMenuItemConfig) => boolean): boolean {
  return items.some((item) => pred(item) || anyItem(item.options ?? [], pred));
}

/** True when any button — top-level or nested in a menu — already launches the entry. */
function dockTargets(buttons: readonly DockButtonConfig[], registryEntryId: string): boolean {
  return buttons.some((b) =>
    b.type === 'DropdownButton'
      ? anyItem(b.options, (item) => launches(item, registryEntryId))
      : launches(b, registryEntryId),
  );
}

/**
 * Collapses every button/menu-item that launches `registryEntryId` down to
 * the FIRST one found (top level before menus, depth-first within a menu),
 * dropping the rest. `addDockButton` is meant to be idempotent — `dockTargets`
 * treats "at least one" as already-satisfied — but a self-healing bootstrap
 * call racing another window's identical call (both reading the dock config
 * before either's write lands) can each independently decide "not present
 * yet" and each append their own button, since a placement's `id` is a fresh
 * UUID per call. This restores the invariant `addDockButton` already claims:
 * zero or one entry per component, never more.
 */
function pruneExtraDockTargets(
  buttons: readonly DockButtonConfig[],
  registryEntryId: string,
): { buttons: DockButtonConfig[]; removed: number } {
  let seen = false;
  let removed = 0;
  const keep = (isMatch: boolean): boolean => {
    if (!isMatch) return true;
    if (!seen) {
      seen = true;
      return true;
    }
    removed += 1;
    return false;
  };
  const pruneMenu = (items: readonly DockMenuItemConfig[]): DockMenuItemConfig[] =>
    items
      .filter((item) => keep(launches(item, registryEntryId)))
      .map((item) => (item.options ? { ...item, options: pruneMenu(item.options) } : item));

  const next = buttons
    .filter((b) => b.type === 'DropdownButton' || keep(launches(b, registryEntryId)))
    .map((b) => (b.type === 'DropdownButton' ? { ...b, options: pruneMenu(b.options) } : b));
  return { buttons: next, removed };
}

/** Rebuilds a menu subtree, dropping every item that launches `registryEntryId`. */
function pruneItems(
  items: readonly DockMenuItemConfig[],
  registryEntryId: string,
  onRemoved: () => void,
): DockMenuItemConfig[] {
  const kept: DockMenuItemConfig[] = [];
  for (const item of items) {
    if (launches(item, registryEntryId)) {
      onRemoved();
      continue;
    }
    kept.push(item.options ? { ...item, options: pruneItems(item.options, registryEntryId, onRemoved) } : item);
  }
  return kept;
}

/** Rebuilds a menu subtree, retitling every item that launches `registryEntryId`. */
function retitleItems(
  items: readonly DockMenuItemConfig[],
  registryEntryId: string,
  tooltip: string,
  onChanged: () => void,
): DockMenuItemConfig[] {
  return items.map((item) => {
    const next = item.options
      ? { ...item, options: retitleItems(item.options, registryEntryId, tooltip, onChanged) }
      : item;
    if (!launches(item, registryEntryId)) return next;
    onChanged();
    return { ...next, tooltip };
  });
}

export interface NewComponentSpec {
  id: string;
  hostUrl: string;
  displayName: string;
  componentType: string;
  componentSubType: string;
  configId: string;
  iconId?: string;
  appId: string;
  singleton?: boolean;
  asWindow?: boolean;
}

export function buildRegistryEntry(spec: NewComponentSpec): RegistryEntry {
  return {
    id: spec.id,
    hostUrl: spec.hostUrl,
    iconId: spec.iconId ?? '',
    componentType: spec.componentType,
    componentSubType: spec.componentSubType,
    configId: spec.configId,
    displayName: spec.displayName,
    createdAt: new Date().toISOString(),
    type: 'internal',
    usesHostConfig: true,
    appId: spec.appId,
    configServiceUrl: '',
    singleton: spec.singleton ?? false,
    asWindow: spec.asWindow ?? true,
  };
}

/** True when a registry entry with this id already exists. */
export async function registryEntryExists(id: string): Promise<boolean> {
  const registry = await loadRegistryConfig();
  return Boolean(registry?.entries.some((e) => e.id === id));
}

/** Appends an entry to the Component Registry (no-op if the id is taken). */
export async function addRegistryEntry(entry: RegistryEntry): Promise<void> {
  const registry = await loadRegistryConfig();
  if (registry?.entries.some((e) => e.id === entry.id)) return;
  const next: RegistryEditorConfig = {
    version: registry?.version ?? REGISTRY_CONFIG_VERSION,
    entries: [...(registry?.entries ?? []), entry],
  };
  await saveRegistryConfig(next);
  // Launches re-read the registry from disk on every click, so this isn't
  // needed for the button to work — but any open Registry/Workspace editor
  // keeps a stale component list without it. Same publish the editor does.
  await publishIab(IAB_REGISTRY_CONFIG_UPDATE, next);
}

/** Patches one registry entry in place. Returns false when the id is unknown. */
export async function updateRegistryEntry(id: string, patch: Partial<RegistryEntry>): Promise<boolean> {
  const registry = await loadRegistryConfig();
  if (!registry?.entries.some((e) => e.id === id)) return false;
  const next: RegistryEditorConfig = {
    version: registry.version,
    // `id`/`configId` are the join key to dock buttons and the config row —
    // never let a patch change them, or the entry orphans its own config.
    entries: registry.entries.map((e) => (e.id === id ? { ...e, ...patch, id: e.id, configId: e.configId } : e)),
  };
  await saveRegistryConfig(next);
  await publishIab(IAB_REGISTRY_CONFIG_UPDATE, next);
  return true;
}

/** Removes a registry entry. Returns false when the id is unknown. */
export async function removeRegistryEntry(id: string): Promise<boolean> {
  const registry = await loadRegistryConfig();
  if (!registry?.entries.some((e) => e.id === id)) return false;
  const next: RegistryEditorConfig = {
    version: registry.version,
    entries: registry.entries.filter((e) => e.id !== id),
  };
  await saveRegistryConfig(next);
  await publishIab(IAB_REGISTRY_CONFIG_UPDATE, next);
  return true;
}

/**
 * Removes every dock entry pointing at `registryEntryId` — top-level buttons
 * AND items nested in dropdown menus. Returns how many went.
 *
 * Menus are searched too because a blotter filed under a group lives only as a
 * menu item: skipping those would leave a dead entry that warns and no-ops on
 * click. An emptied group is left in place — the user may have created it, and
 * deleting one blotter shouldn't silently remove their menu.
 */
export async function removeDockButtons(registryEntryId: string): Promise<number> {
  const dock = await loadDockConfig();
  if (!dock) return 0;
  let removed = 0;
  const count = () => { removed += 1; };

  const buttons: DockButtonConfig[] = [];
  for (const b of dock.buttons) {
    if (b.type === 'DropdownButton') {
      buttons.push({ ...b, options: pruneItems(b.options, registryEntryId, count) });
      continue;
    }
    if (launches(b, registryEntryId)) { count(); continue; }
    buttons.push(b);
  }
  if (removed === 0) return 0;

  const next: DockEditorConfig = { version: 1, buttons, updatedAt: new Date().toISOString() };
  await saveDockConfig(next);
  await publishIab(IAB_DOCK_CONFIG_UPDATE, next);
  return removed;
}

/** Retitles every dock entry pointing at `registryEntryId`, menu items included. */
export async function renameDockButtons(registryEntryId: string, tooltip: string): Promise<void> {
  const dock = await loadDockConfig();
  if (!dock) return;
  let changed = false;
  const mark = () => { changed = true; };

  const buttons = dock.buttons.map((b): DockButtonConfig => {
    if (b.type === 'DropdownButton') {
      return { ...b, options: retitleItems(b.options, registryEntryId, tooltip, mark) };
    }
    if (!launches(b, registryEntryId)) return b;
    mark();
    return { ...b, tooltip };
  });
  if (!changed) return;

  const next: DockEditorConfig = { version: 1, buttons, updatedAt: new Date().toISOString() };
  await saveDockConfig(next);
  await publishIab(IAB_DOCK_CONFIG_UPDATE, next);
}

/**
 * Puts `registryEntryId` on the dock (no-op if any button or menu item
 * already targets that entry).
 *
 * Without `group` it appends a top-level ActionButton. With `group` it files
 * the launch entry as an item inside the DropdownButton labelled that,
 * creating the dropdown when the dock has none — so repeated creates
 * accumulate under one menu instead of one top-level button each.
 */
export async function addDockButton(opts: {
  registryEntryId: string;
  tooltip: string;
  iconId?: string;
  asWindow?: boolean;
  /**
   * Label of the dropdown menu to file this under (matched case-insensitively,
   * created if absent). Omit for a top-level dock button.
   */
  group?: string;
  /**
   * Allow writing a dock config when none exists yet. Defaults to FALSE and
   * should stay that way for background/bootstrap callers.
   *
   * When there is no saved dock config the platform renders a built-in
   * default dock from code. Saving a config containing only our button
   * REPLACES that default — i.e. it wipes every existing dock button. Only a
   * user-initiated action (an explicit "add this to the dock" request) should
   * ever be allowed to create the first config.
   */
  allowCreate?: boolean;
}): Promise<boolean> {
  const dock = await loadDockConfig();
  if (!dock && !opts.allowCreate) {
    console.warn(
      `[aiAssistant] no saved dock config — skipping dock button for "${opts.registryEntryId}" rather than replacing the platform's default dock.`,
    );
    return false;
  }
  const rawExisting = dock?.buttons ?? [];
  // Collapse any duplicates left over from a past race (see
  // pruneExtraDockTargets) before deciding whether to add — otherwise a
  // duplicate just sits there forever, since "already present" already
  // short-circuits the add below.
  const { buttons: existing, removed } = pruneExtraDockTargets(rawExisting, opts.registryEntryId);
  if (removed > 0) {
    const deduped: DockEditorConfig = { version: 1, buttons: existing, updatedAt: new Date().toISOString() };
    await saveDockConfig(deduped);
    await publishIab(IAB_DOCK_CONFIG_UPDATE, deduped);
  }
  // Idempotency spans menus as well as the dock bar — an entry already filed
  // under a group must not also gain a top-level button.
  if (dockTargets(existing, opts.registryEntryId)) return true;

  // Ids are UUIDs (a placement, not the component) — matches what the Dock
  // Editor writes. Identity for idempotency comes from `customData` above.
  const launchAction = {
    actionId: ACTION_LAUNCH_COMPONENT,
    customData: { registryEntryId: opts.registryEntryId, asWindow: opts.asWindow ?? true },
  };

  const group = opts.group;
  let buttons: DockButtonConfig[];
  if (group) {
    const item: DockMenuItemConfig = {
      id: crypto.randomUUID(),
      tooltip: opts.tooltip,
      iconId: opts.iconId ?? '',
      ...launchAction,
    };
    const target = existing.find(
      (b): b is DockDropdownButtonConfig => b.type === 'DropdownButton' && sameLabel(b.tooltip, group),
    );
    buttons = target
      ? existing.map((b) => (b === target ? { ...target, options: [...target.options, item] } : b))
      : [
          ...existing,
          {
            type: 'DropdownButton',
            id: crypto.randomUUID(),
            tooltip: group,
            iconUrl: '',
            iconId: 'lucide:folder',
            iconColor: '',
            options: [item],
          },
        ];
  } else {
    buttons = [
      ...existing,
      {
        type: 'ActionButton',
        id: crypto.randomUUID(),
        tooltip: opts.tooltip,
        iconUrl: '',
        iconId: opts.iconId ?? '',
        iconColor: '',
        ...launchAction,
      },
    ];
  }

  const next: DockEditorConfig = {
    version: 1,
    buttons,
    updatedAt: new Date().toISOString(),
  };
  await saveDockConfig(next);
  // Persisting alone is NOT enough: the dock is built once at platform
  // startup, so a saved-but-unpublished button doesn't appear until restart.
  // The platform subscribes to IAB_DOCK_CONFIG_UPDATE and rebuilds the live
  // dock on receipt — the same path the Dock Editor's Save button uses.
  await publishIab(IAB_DOCK_CONFIG_UPDATE, next);
  return true;
}

/**
 * Broadcast a config change to the running platform. No-op outside OpenFin
 * (plain-browser dev has no dock), and never throws — the caller has already
 * persisted, so the worst case is the change appearing after a restart.
 */
async function publishIab(topic: string, payload: unknown): Promise<void> {
  try {
    if (typeof fin === 'undefined' || !fin) return;
    await fin.InterApplicationBus.publish(topic, payload);
  } catch (err) {
    console.warn(`[aiAssistant] publish ${topic} failed — change applies after restart:`, err);
  }
}
