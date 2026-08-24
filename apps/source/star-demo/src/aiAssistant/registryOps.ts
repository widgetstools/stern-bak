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
} from '@wellsfargo-starui/openfin/config';

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

/** Removes every dock button pointing at `registryEntryId`. Returns how many went. */
export async function removeDockButtons(registryEntryId: string): Promise<number> {
  const dock = await loadDockConfig();
  if (!dock) return 0;
  const keep = dock.buttons.filter(
    (b) =>
      !(b.type === 'ActionButton' &&
        (b.customData as { registryEntryId?: string } | undefined)?.registryEntryId === registryEntryId),
  );
  const removed = dock.buttons.length - keep.length;
  if (removed === 0) return 0;
  const next: DockEditorConfig = { version: 1, buttons: keep, updatedAt: new Date().toISOString() };
  await saveDockConfig(next);
  await publishIab(IAB_DOCK_CONFIG_UPDATE, next);
  return removed;
}

/** Retitles every dock button pointing at `registryEntryId`. */
export async function renameDockButtons(registryEntryId: string, tooltip: string): Promise<void> {
  const dock = await loadDockConfig();
  if (!dock) return;
  let changed = false;
  const buttons = dock.buttons.map((b) => {
    const targets =
      b.type === 'ActionButton' &&
      (b.customData as { registryEntryId?: string } | undefined)?.registryEntryId === registryEntryId;
    if (!targets) return b;
    changed = true;
    return { ...b, tooltip };
  });
  if (!changed) return;
  const next: DockEditorConfig = { version: 1, buttons, updatedAt: new Date().toISOString() };
  await saveDockConfig(next);
  await publishIab(IAB_DOCK_CONFIG_UPDATE, next);
}

/**
 * Appends a dock ActionButton that launches `registryEntryId`
 * (no-op if a button already targets that entry).
 */
export async function addDockButton(opts: {
  registryEntryId: string;
  tooltip: string;
  iconId?: string;
  asWindow?: boolean;
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
  const already = dock?.buttons.some(
    (b) =>
      b.type === 'ActionButton' &&
      (b.customData as { registryEntryId?: string } | undefined)?.registryEntryId === opts.registryEntryId,
  );
  if (already) return true;

  const next: DockEditorConfig = {
    version: 1,
    buttons: [
      ...(dock?.buttons ?? []),
      {
        // Button ids are UUIDs (a button is a placement, not the component) —
        // matches the shape written by the Dock Editor. Identity for
        // idempotency comes from `customData.registryEntryId` above.
        type: 'ActionButton',
        id: crypto.randomUUID(),
        tooltip: opts.tooltip,
        iconUrl: '',
        iconId: opts.iconId ?? '',
        iconColor: '',
        actionId: ACTION_LAUNCH_COMPONENT,
        customData: { registryEntryId: opts.registryEntryId, asWindow: opts.asWindow ?? true },
      },
    ],
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
