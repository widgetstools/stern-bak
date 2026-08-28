/**
 * Profile reads and writes for a registered blotter — and the template /
 * instance distinction that decides where a change lands.
 *
 * ## The assistant configures the COMPONENT
 *
 * A registry entry's `configId` addresses the component's TEMPLATE row
 * (`isTemplate: true`). That row is the component's definition, and it is what
 * the dock-launched assistant writes — the same role Workspace Setup plays. It
 * never edits a running instance, and never enumerates them.
 *
 * Whether that is also the row on screen depends on the component:
 *   - a SINGLETON's window reuses the template id, so the template IS its live
 *     row and the change applies immediately (`launch.ts`: "instanceId ===
 *     templateId, the view IS the template"). Blotters `create_blotter` makes
 *     are singletons, so this is the normal case;
 *   - a MULTI-INSTANCE blotter clones the template into a per-window row at
 *     launch, so its open windows keep what they were opened with until they
 *     are opened again — exactly what editing it in Workspace Setup does.
 *
 * Two narrower scopes mean "this window", not "the component", and only they
 * ever touch an instance row (see `resolveWriteTargets`): a panel opened from a
 * blotter's wand button is pinned to the window it came from — an unpinned
 * call in that session writes THAT row alone, never the template — and a call
 * that names its own `instanceId` writes that row alone instead. The pinning
 * itself happens one layer up, in `useToolExecutor.ts`'s `dispatchTool`.
 */
import type { ConfigManager, ProfileSnapshot } from '@wellsfargo-starui/core/host/config';
import { loadRegistryConfig, type RegistryEntry } from '@wellsfargo-starui/openfin/config';

/** Registered MarketsGrid blotters all share this componentType. */
export const BLOTTER_COMPONENT_TYPE = 'grid';

/** Looks a blotter up by its Component Registry id. */
export async function resolveGridEntry(targetGridId: string): Promise<RegistryEntry | undefined> {
  const registry = await loadRegistryConfig();
  return registry?.entries.find((e) => e.id === targetGridId && e.componentType === BLOTTER_COMPONENT_TYPE);
}

/**
 * Finds the registry entry behind a LIVE WINDOW's instance id.
 *
 * A blotter window knows its own `instanceId` and little else — under OpenFin
 * that's the minted per-window id, in a browser it's the route's
 * `defaultInstanceId`. Neither is a registry id, which is what every tool takes.
 *
 * Three ways in, cheapest first:
 *  1. the instance IS the template (singleton components reuse the id);
 *  2. the instance's own config row carries `componentType`/`componentSubType`,
 *     stamped when `launch.ts` cloned it — that derives the template id;
 *  3. the row is missing or bare, in which case we can't tell and the caller
 *     should say so rather than guess.
 */
export async function resolveGridForInstance(
  configManager: ConfigManager,
  instanceId: string,
): Promise<RegistryEntry | undefined> {
  const registry = await loadRegistryConfig();
  const entries = (registry?.entries ?? []).filter((e) => e.componentType === BLOTTER_COMPONENT_TYPE);

  const direct = entries.find((e) => e.configId === instanceId || e.id === instanceId);
  if (direct) return direct;

  try {
    const row = await configManager.getConfig(instanceId);
    const componentType = row?.componentType;
    const componentSubType = row?.componentSubType;
    if (componentType && componentSubType) {
      const templateId = `${componentType}-${componentSubType}`.toLowerCase();
      const bySubType = entries.find((e) => e.configId === templateId || e.id === templateId);
      if (bySubType) return bySubType;
    }
  } catch (err) {
    console.debug('[aiAssistant] could not read the instance config row:', err);
  }

  return undefined;
}

export interface GridTarget {
  entry: RegistryEntry;
  /** Set when the id named one window rather than the blotter. */
  pinnedInstanceId?: string;
}

/**
 * Resolves whatever id a caller supplied — a registry id or a window's
 * instance id — to the blotter, plus the window when one was named.
 *
 * `list_grid_instances` hands back instance ids, and a scoped panel knows its
 * own; both were previously dead ends, because every tool took a registry id
 * and nothing else. Accepting either here is what makes those ids usable
 * without teaching each of the two dozen handlers about instances.
 */
export async function resolveGridTarget(
  configManager: ConfigManager,
  id: string,
): Promise<GridTarget | undefined> {
  const byRegistryId = await resolveGridEntry(id);
  if (byRegistryId) {
    // A singleton's instance id IS its registry configId, so there is no
    // separate window to pin — the one row is the template.
    return { entry: byRegistryId };
  }
  const entry = await resolveGridForInstance(configManager, id);
  return entry ? { entry, pinnedInstanceId: id } : undefined;
}

/**
 * The platform's reserved id for a grid's default profile. Seeding anything
 * else (e.g. 'default') makes `ProfileManager.boot()` create a SECOND empty
 * "Default" beside ours, and the user's customizations land on the invisible one.
 */
export const DEFAULT_PROFILE_ID = '__default__';

export type { ProfileSnapshot };

/**
 * Which rows a request is about, for the duration of one tool call.
 *
 * Two different things, deliberately separate:
 *
 *  - `focusInstanceId` — the window the request came FROM (the wand button).
 *    On its own, at this layer, it is only a fan-out hint for `resolveWriteTargets`
 *    (see its comment) — but `dispatchTool` in `useToolExecutor.ts` promotes it to
 *    the DEFAULT `pinnedInstanceId` for any call that doesn't name its own
 *    instance, which is what makes an ordinary unpinned call in a wand-scoped
 *    session land on this window alone. It only stays a bare hint for a caller
 *    that reaches `resolveWriteTargets`/`patchGridModule` directly without going
 *    through `dispatchTool`.
 *  - `pinnedInstanceId` — the window the request is ABOUT, named explicitly OR
 *    defaulted from `focusInstanceId` as above. A boundary. Reads come from that
 *    row and writes go to it alone, so "make THIS window group by sector"
 *    doesn't reformat its three siblings.
 *
 * Ambient rather than threaded through a dozen handler signatures. Safe because
 * tool calls here are strictly sequential — the turn loop awaits each one — and
 * the executor is per-window.
 */
export interface GridScope {
  focusInstanceId?: string;
  pinnedInstanceId?: string;
}

let ambientScope: GridScope = {};

export async function withGridScope<T>(scope: GridScope, run: () => Promise<T>): Promise<T> {
  const previous = ambientScope;
  ambientScope = scope;
  try {
    return await run();
  } finally {
    ambientScope = previous;
  }
}

export function currentFocusInstance(): string | undefined {
  return ambientScope.focusInstanceId;
}

/** Set only when the caller named one window; undefined means "the blotter". */
export function currentPinnedInstance(): string | undefined {
  return ambientScope.pinnedInstanceId;
}

/**
 * The row to READ a blotter's state from.
 *
 * Defaults to the template, which is right when the question is about the
 * blotter as a whole. When a window is pinned it reads THAT window instead —
 * two instances can be on different profiles, with different renames, hidden
 * columns and provider bindings, so reading the template would answer about a
 * row nobody is looking at.
 */
export function gridScopeId(entry: RegistryEntry): string {
  return currentPinnedInstance() ?? entry.configId;
}

export interface WriteTarget {
  instanceId: string;
  isTemplate: boolean;
  /** Human-facing label used in tool summaries. */
  label: string;
}

/**
 * Which profile a window is currently showing.
 *
 * Published into the row's grid-level data by `publishActiveProfile` in the
 * blotter (`useLiveProfileSync.ts`) — it can't be discovered from here, because
 * the localStorage fallback is keyed by `gridId` (shared by every blotter of a
 * route) and the authoritative per-view value lives on OpenFin customData.
 * Falls back to the default profile, which is what a window that predates the
 * publishing, or has never been opened, is on anyway.
 */
export async function readActiveProfileId(
  configManager: ConfigManager,
  instanceId: string,
): Promise<string> {
  try {
    const gridLevelData = (await configManager.profiles.loadGridLevelData({ instanceId })) as
      | { activeProfileId?: string }
      | null;
    const id = gridLevelData?.activeProfileId;
    if (typeof id === 'string' && id) return id;
  } catch {
    /* no grid-level data — fall through to the default */
  }
  return DEFAULT_PROFILE_ID;
}

/**
 * Loads the profile a window is actually showing, or an empty one to patch when
 * the row has none yet.
 *
 * Editing `__default__` while the user has "L1" selected writes changes they
 * will never see — the symptom that made the assistant look broken.
 */
export async function readActiveProfile(
  configManager: ConfigManager,
  instanceId: string,
): Promise<ProfileSnapshot> {
  const [snapshots, activeId] = await Promise.all([
    configManager.profiles.list({ instanceId }),
    readActiveProfileId(configManager, instanceId),
  ]);
  const existing =
    snapshots.find((s) => s.id === activeId) ??
    snapshots.find((s) => s.id === DEFAULT_PROFILE_ID) ??
    snapshots[0];
  if (existing) return existing;
  const now = Date.now();
  return { id: activeId, gridId: instanceId, name: 'Default', state: {}, createdAt: now, updatedAt: now };
}

/**
 * @deprecated Prefer {@link readActiveProfile}. Kept for the few reads that
 * genuinely mean "the default profile" rather than "what the user is seeing".
 */
export async function readDefaultProfile(
  configManager: ConfigManager,
  instanceId: string,
): Promise<ProfileSnapshot> {
  return readActiveProfile(configManager, instanceId);
}

function identityFor(entry: RegistryEntry, isTemplate: boolean) {
  return {
    componentType: entry.componentType,
    componentSubType: entry.componentSubType,
    isTemplate,
    // Only the template row carries the entry's singleton flag; cloned
    // instance rows are minted with `singleton: false` (see launch.ts).
    singleton: isTemplate ? entry.singleton : false,
  };
}

/**
 * Instance rows cloned from this entry's template, newest first. A singleton
 * reuses the template id, so it never appears here — its single row IS the
 * template and is covered by the template target.
 */
export async function listInstanceRows(
  configManager: ConfigManager,
  entry: RegistryEntry,
): Promise<Array<{ configId: string; displayText?: string; updatedTime?: string }>> {
  const rows = await configManager.findByComponentType(entry.componentType, entry.componentSubType);
  return rows
    .filter((row) => row.isTemplate !== true && row.configId !== entry.configId)
    .map((row) => ({
      configId: row.configId,
      displayText: row.displayText,
      updatedTime: row.updatedTime,
    }))
    // Newest first — `updatedTime` is an ISO timestamp, so lexical order is
    // chronological order.
    .sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));
}

/**
 * Which rows a change is written to.
 *
 * The dock-launched assistant configures the COMPONENT, exactly as Workspace
 * Setup does: it writes the template and nothing else. It never edits a running
 * instance, and it does not enumerate them — the template is the component's
 * definition, and that is what "configure this blotter" means.
 *
 * That is why there is no instance fan-out here any more. Spraying every
 * discovered instance row made a dock-launched edit behave differently
 * depending on which windows happened to be open, and left the template and its
 * instances disagreeing about what the component is. Blotters the assistant
 * creates are singletons, so the template IS the row their window reads — the
 * change is live there anyway (see `blotterTools.createBlotter`).
 *
 * The two narrower scopes remain, both of which mean "this window", not "the
 * component":
 *
 *  - `pinned` — the caller named one window (explicitly, or via `dispatchTool`
 *    defaulting it from `focusInstanceId` — see `GridScope` above). A boundary:
 *    that row alone.
 *  - `focusInstanceId` — reached here ONLY when nothing is pinned, i.e. a caller
 *    that talks to `resolveWriteTargets`/`patchGridModule` directly rather than
 *    through `dispatchTool`. Written ALONGSIDE the template, template included,
 *    for that lower-level case. Every real tool call goes through `dispatchTool`,
 *    which always promotes a wand-launched panel's focus to a pin before it gets
 *    here — so in practice this branch is not what a wand-scoped conversation's
 *    calls hit; it stays correct and tested as a generic primitive.
 */
export async function resolveWriteTargets(
  configManager: ConfigManager,
  entry: RegistryEntry,
  focusInstanceId: string | undefined = currentFocusInstance(),
): Promise<WriteTarget[]> {
  // A pinned window is a boundary, not a hint: write there and nowhere else.
  // The template is deliberately excluded — including it would leak the change
  // into every window opened afterwards, which is the opposite of what "just
  // this one" asks for.
  const pinned = currentPinnedInstance();
  if (pinned) {
    // A singleton's window reuses the template id, so pinning one addresses the
    // TEMPLATE row. Stamping it `isTemplate: false` would rewrite the template's
    // own identity and strip its singleton flag — the row would stop being
    // discoverable as this component's template.
    const isTemplate = pinned === entry.configId;
    return [{
      instanceId: pinned,
      isTemplate,
      label: isTemplate ? `${entry.displayName} (template)` : `${pinned} (this window only)`,
    }];
  }

  const targets: WriteTarget[] = [
    { instanceId: entry.configId, isTemplate: true, label: `${entry.displayName} (template)` },
  ];

  // The only instance a write ever reaches unpinned, and only for a panel
  // opened FROM a window. `configManager` is kept on the signature because
  // callers pass it and the pinned/template resolution above may grow to need
  // it; nothing here reads a row any more.
  void configManager;
  if (focusInstanceId && focusInstanceId !== entry.configId) {
    targets.push({ instanceId: focusInstanceId, isTemplate: false, label: `${focusInstanceId} (this window)` });
  }
  return targets;
}

export function patchModuleState(snapshot: ProfileSnapshot, moduleId: string, data: unknown): ProfileSnapshot {
  const prevVersion = snapshot.state[moduleId]?.v ?? 1;
  return {
    ...snapshot,
    state: { ...snapshot.state, [moduleId]: { v: prevVersion, data } },
    updatedAt: Date.now(),
  };
}

export interface FanOutResult {
  /** How many open/persisted instances also received the change. */
  instances: number;
  /** Profile the focused window was edited in, when it isn't the default. */
  profileId?: string;
  /** Set when the write was confined to one named window. */
  pinnedInstanceId?: string;
}

/**
 * Read → patch one module's state → write back, across the template and every
 * instance. `update` is invoked once per target with that target's own state.
 */
export async function patchGridModule(
  configManager: ConfigManager,
  entry: RegistryEntry,
  moduleId: string,
  update: (prevData: unknown) => unknown,
  focusInstanceId?: string,
): Promise<FanOutResult> {
  const targets = await resolveWriteTargets(configManager, entry, focusInstanceId);
  const pinnedInstanceId = currentPinnedInstance();
  let instances = 0;
  let profileId: string | undefined;
  for (const target of targets) {
    // Each row is patched in the profile IT is showing — two windows of the
    // same blotter can legitimately be on different profiles.
    const profile = await readActiveProfile(configManager, target.instanceId);
    const named = target.instanceId === (pinnedInstanceId ?? focusInstanceId);
    if (named && profile.id !== DEFAULT_PROFILE_ID) profileId = profile.id;
    const next = patchModuleState(profile, moduleId, update(profile.state[moduleId]?.data));
    await configManager.profiles.save({ instanceId: target.instanceId }, next, {
      identity: identityFor(entry, target.isTemplate),
    });
    if (!target.isTemplate) instances += 1;
  }
  return { instances, profileId, pinnedInstanceId };
}

/** Same fan-out for grid-level data (provider bindings, captions). */
export async function patchGridLevelData(
  configManager: ConfigManager,
  entry: RegistryEntry,
  update: (prev: Record<string, unknown>) => Record<string, unknown>,
  focusInstanceId?: string,
): Promise<FanOutResult> {
  const targets = await resolveWriteTargets(configManager, entry, focusInstanceId);
  let instances = 0;
  for (const target of targets) {
    const prev = ((await configManager.profiles.loadGridLevelData({ instanceId: target.instanceId })) ??
      {}) as Record<string, unknown>;
    await configManager.profiles.saveGridLevelData({ instanceId: target.instanceId }, update(prev), {
      identity: identityFor(entry, target.isTemplate),
    });
    if (!target.isTemplate) instances += 1;
  }
  return { instances, pinnedInstanceId: currentPinnedInstance() };
}

/**
 * Tail appended to tool summaries, naming what the change actually reached.
 *
 * Naming the profile matters: a change written to a profile the user isn't on
 * looks like no change at all, and this is what lets the model say which one it
 * touched.
 */
export function describeFanOut(result: FanOutResult): string {
  const profile = result.profileId ? `, in the active profile "${result.profileId}"` : '';
  // A window-only change is the one the user most needs told back to them: it
  // deliberately skips the template, so a window opened later won't have it.
  if (result.pinnedInstanceId) {
    return ` — that window only, not the blotter's other windows or new ones${profile}`;
  }
  // Unpinned writes are edits to the COMPONENT, so the tail says so rather than
  // counting windows. The one extra row a wand-launched panel writes is the
  // window it was opened from, which is already obvious to that user.
  return `${result.instances > 0 ? ' (its template and this window)' : ''}${profile}`;
}
